# Professional Audit Engine v2 — Evidence Contract v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned, runtime-validated evidence layer under Lensiq's audit report — independent desktop/mobile extraction, typed CTA outcomes, separated cookie-banner detect/dismiss, missing SEO/console/network capture, and lab-vs-field performance evidence — with zero DB migration, zero breakage of `/audits/demo` or existing completed audits, and exactly three narrow report-copy corrections.

**Architecture:** An additive, optional `ExtractedPage.evidence?: AuditEvidenceV2` field, assembled by the scanner/worker pipeline, sanitized and Zod-validated before persistence, safe-parsed on read (degrading to `undefined` on any legacy/invalid row rather than throwing). Legacy `cookieBanner`/`ctaJourneys` fields are derived from the v2 evidence by pure mapping functions — one measurement, two shapes, never two measurements.

**Tech Stack:** Next.js 16 App Router / TypeScript, Playwright, Lighthouse, Zod 4, Supabase (service-role admin client only), Docker for all builds/tests (per the user's global Docker-only policy) via `docker-compose`.

**No unit test framework exists in this repo** (`package.json` has no jest/vitest/mocha and no `test` script). Following this repo's established convention (confirmed in the prior Access Control Hardening sprint): each task's steps are "write code → `typecheck` → `lint`," with full live/behavioral verification deferred to Task 16, run against a real controlled fixture through the actual worker pipeline — not a mocked unit test.

## Global Constraints

- Never coerce an unmeasured/not-assessed fact to `false`, `0`, or an empty result — use a `value | null` field paired with its own `...Status: EvidenceStatus` sibling field, exactly as specified per-field below.
- No generic `EvidenceItem<T>` envelope type — every uncertain field uses the concrete `value | null` + `...Status` sibling-field pattern directly.
- `ExtractedPage.cookieBanner` and `ExtractedPage.ctaJourneys` (the legacy fields) are computed **only** by pure derivation functions from the v2 evidence (`deriveLegacyCookieBanner`, `deriveLegacyCtaJourneys`) — never by a second, independent scan/click pass.
- Every URL field in the contract passes through `sanitizeUrl` (strips fragment always; replaces a non-empty query string with a fixed `"?[redacted]"` marker by default; truncates an overlong path) and every `reason`/`error`/`message` field through `sanitizeText` (redacts emails, JWTs, `Bearer <token>`, common API-key shapes, UUIDs, generic long hash/token-like sequences; truncates) before persistence — including `TestExecutionRecord.reason` even for fixed internal strings.
- The full JSON-LD script text is never stored — only parse outcome, declared types, an irreversible `sha256` hash, and (only when genuinely needed for `contentMatch`) a short sanitized excerpt.
- `AuditEvidenceV2Schema.parse()` runs before persistence in `saveScan()`'s caller; a throw means the whole audit is treated as failed (`failAudit`), never a silent partial write. `AuditEvidenceV2Schema.safeParse()` runs on every read in `getAudit`/`getOwnedAuditFull`; failure (or `evidence` simply absent, as for every pre-sprint row) sets `page.evidence = undefined` and logs a sanitized line (audit id + Zod issue count/paths only, never field values) — it never throws up through a page or API route.
- No new Supabase migration. `ExtractedPage.evidence` rides through the existing `audit_pages.extracted_json` jsonb column exactly like every other `ExtractedPage` field.
- Cookie-banner screenshots exist only as in-memory `Buffer`s until uploaded; `screenshotBeforeDismiss`/`screenshotAfterDismiss` are set only after a successful upload; a failed upload leaves the field absent and records `{ id: "cookie-banner-screenshot-upload", status: "failed", reason: <sanitized> }` — never a fabricated URL.
- `AuditTestId` is a closed union; no free-text test names anywhere in `methodology.tests`.
- Every redirect hop — page-level and CTA-level, same-origin or not — is re-validated with `assertSafeUrl`/`resolveSafeHostAddress` before the navigation is allowed to proceed.
- No raw SQL against the database at any point during implementation or verification — all test data via legitimate app functions (`createAudit`, the real worker pipeline) or the Supabase admin JS client (parameterized), never literal SQL text. (No exception this sprint — the prior sprint's one-time exception does not carry over.)
- Task 16's fixture is a temporary, standalone public Vercel deployment — **not** `localhost` (the existing SSRF guards deliberately block private/loopback targets, so a localhost fixture would never traverse the real pipeline). `noindex, nofollow`, unlinked from anywhere, torn down after verification; its URL is tracked only in a local temp file, never committed.
- `demoAudit` (`src/lib/audit/demo.ts`) and `/audits/demo` render unchanged — no v2 evidence added to the fixture this sprint. Every new `ExtractedPage`/evidence field is optional so pre-sprint completed audits keep rendering exactly as today.
- No benchmark or competitor references in code, commits, or docs.
- Out of scope, confirmed unchanged this sprint: expert prompts (`src/lib/audit/experts/*`), the Executive Reviewer, scoring logic, CrUX integration, pricing copy, the worker's deployment mechanism, auth/checkout/webhook/legal pages, RLS, browser-side Supabase client, PDF/share links, multi-page crawling.

---

### Task 1: Evidence Contract types

**Files:**
- Create: `src/lib/audit/evidence-types.ts`
- Modify: `src/lib/audit/types.ts:6-23` (add optional `evidence` field to `ExtractedPage`)

**Interfaces:**
- Produces: every type below, imported by all subsequent tasks.

- [ ] **Step 1: Create the evidence types file**

```ts
// src/lib/audit/evidence-types.ts

export type EvidenceStatus = "verified" | "inferred" | "not-assessed";

export type AuditTestId =
  | "desktop-dom"
  | "mobile-dom"
  | "cta-journey-desktop"
  | "cta-journey-mobile"
  | "cookie-banner-desktop"
  | "cookie-banner-mobile"
  | "cookie-banner-screenshot-upload"
  | "seo-extraction"
  | "console-network-desktop"
  | "console-network-mobile"
  | "lighthouse-lab";

export interface TestExecutionRecord {
  id: AuditTestId;
  status: "passed" | "failed" | "skipped";
  reason?: string;
}

export interface AuditMethodology {
  contractVersion: 2;
  startedAt: string;
  finishedAt: string;
  requestedUrl: string;
  finalUrl: string;
  pageGoal: string;
  scope: "single-page";
  viewports: { desktop: { width: number; height: number }; mobile: { width: number; height: number } };
  userAgent: { desktop: string; mobile: string };
  tool: { lighthouseVersion: string };
  redirects: { from: string; to: string; status: number }[];
  tests: TestExecutionRecord[];
  limitations: string[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlapCandidate {
  selector: string;
  overlapsWithSelector: string;
  issue: "cutoff" | "overlap";
  boundingBox: BoundingBox;
}

export interface SmallTapTargetCandidate {
  selector: string;
  boundingBox: BoundingBox;
  widthPx: number;
  heightPx: number;
}

export interface CookieBannerEvidence {
  detected: boolean;
  dismissAttempted: boolean;
  dismissed: boolean;
  blocking: boolean | null;
  blockingStatus: EvidenceStatus;
  buttonsFound: string[];
  screenshotBeforeDismiss?: string;
  screenshotAfterDismiss?: string;
}

export type CtaOutcome = "navigated" | "redirected" | "http-error" | "network-error" | "external-not-visited" | "skipped-limit" | "skipped-invalid-url";

export interface CtaJourneyEvidence {
  text: string;
  element: string;
  declaredUrl: string;
  sameOrigin: boolean;
  navigationAttempted: boolean;
  finalUrl?: string;
  redirectCount?: number;
  httpStatus?: number;
  outcome: CtaOutcome;
  screenshotRef?: string;
  error?: string;
  skippedReason?: string;
}

export interface BrowserEvidence {
  viewport: "desktop" | "mobile";
  headline: string | null;
  headingHierarchy: { level: number; text: string }[];
  aboveFold: { text: string; ctaTexts: string[]; imageCount: number };
  ctasVisible: { text: string; href: string; tag: string; position: "above-fold" | "below-fold" }[];
  navPresent: boolean;
  hasHorizontalOverflow: boolean | null;
  overlapCandidates: OverlapCandidate[] | null;
  overlapCandidatesStatus: EvidenceStatus;
  smallTapTargetCandidates: SmallTapTargetCandidate[] | null;
  smallTapTargetCandidatesStatus: EvidenceStatus;
  forms: { action: string; inputs: { name: string; type: string; hasLabel: boolean }[] }[];
  landmarks: { hasNav: boolean; hasFooter: boolean; hasMain: boolean };
  images: { src: string; hasAlt: boolean; aboveFold: boolean }[];
  cookieBanner: CookieBannerEvidence;
}

export interface ConsoleNetworkEvidence {
  consoleErrors: { message: string; timestamp: string }[];
  pageErrors: { message: string; timestamp: string }[];
  failedRequests: { url: string; resourceType: string; domain: string; status: number | null; message?: string }[];
  limits: { maxConsoleErrors: number; maxFailedRequests: number; truncated: boolean };
}

export interface ViewportEvidence {
  browser: BrowserEvidence;
  console: ConsoleNetworkEvidence;
  ctaJourneys: CtaJourneyEvidence[] | null;
}

export interface JsonLdEvidence {
  parsed: boolean;
  types: string[];
  parseError?: string;
  excerptHash: string;
  sanitizedExcerpt?: string;
  contentMatch: boolean | null;
  contentMatchStatus: EvidenceStatus;
}

export interface SeoEvidence {
  title: string;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;
  htmlLang: string | null;
  viewportMeta: string | null;
  headings: { level: number; text: string }[];
  hreflang: { lang: string; href: string }[];
  openGraph: { property: string; content: string }[];
  jsonLd: JsonLdEvidence[];
  links: { text: string; href: string; sameOrigin: boolean }[];
  pageStatus: { initialStatus: number | null; finalStatus: number | null; redirectChain: { from: string; to: string; status: number }[] };
}

export interface PerformanceEvidence {
  lab: { lcp: number | null; cls: number | null; tbt: number | null; ttfb: number | null; source: "lighthouse"; lighthouseVersion: string };
  field: {
    source: "not-integrated" | "crux";
    status: "not-assessed" | "insufficient-data" | "available";
    percentile: 75 | null;
    periodDays: number | null;
    lcp: number | null;
    cls: number | null;
    inp: number | null;
  };
  testConditions: {
    formFactor: "desktop" | "mobile";
    throttlingMethod: string | null;
    cpuThrottling: string | null;
    networkProfile: string | null;
    locale: string;
    lighthouseVersion: string;
    runCount: number;
    limitations: string[];
  };
}

export interface AccessibilityEvidence {
  standard: "WCAG 2.2";
  automatedChecks: { source: "lighthouse"; score: number; failedAudits: { id: string; title: string; impact?: string }[] };
  browserObservations: { imagesWithoutAlt: number; formInputsWithoutLabel: number; landmarksPresent: string[] };
  requiresHumanVerification: string[];
}

export interface AuditEvidenceV2 {
  contractVersion: 2;
  methodology: AuditMethodology;
  seo: SeoEvidence;
  desktop: ViewportEvidence;
  mobile: ViewportEvidence;
  performance: PerformanceEvidence;
  accessibility: AccessibilityEvidence;
}
```

- [ ] **Step 2: Add the optional `evidence` field to `ExtractedPage`**

In `src/lib/audit/types.ts`, add the import and one new optional field:

```ts
import type { AuditEvidenceV2 } from "@/lib/audit/evidence-types";
```

Add `evidence?: AuditEvidenceV2;` as the last field inside the `ExtractedPage` interface (after `mobileScreenshotPath?: string;`, before the closing brace).

- [ ] **Step 3: Typecheck**

Run: `docker-compose run --rm web npx tsc --noEmit`
Expected: no errors (the new field is optional; nothing currently reads it).

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/evidence-types.ts src/lib/audit/types.ts
git commit -m "feat: add Evidence Contract v2 types"
```

---

### Task 2: Centralized sanitization

**Files:**
- Create: `src/lib/audit/evidence-sanitize.ts`

**Interfaces:**
- Consumes: nothing (pure functions, no project imports beyond `node:crypto`).
- Produces: `sanitizeUrl(raw: string): string`, `sanitizeText(raw: string, maxLength: number): string`, `hashContent(raw: string): string` — used by Tasks 5-13.

- [ ] **Step 1: Write the sanitizer**

```ts
// src/lib/audit/evidence-sanitize.ts
import { createHash } from "node:crypto";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const API_KEY_PATTERN = /\b(sk|pk|rk)_[A-Za-z0-9]{10,}\b|\bAIza[A-Za-z0-9_-]{20,}\b/g;
const UUID_PATTERN = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const GENERIC_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;

function redactContent(input: string): string {
  return input
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(API_KEY_PATTERN, "[redacted-api-key]")
    .replace(UUID_PATTERN, "[redacted-uuid]")
    .replace(GENERIC_TOKEN_PATTERN, "[redacted-token]");
}

export function sanitizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return sanitizeText(raw, 300);
  }
  url.hash = "";
  if (url.search) url.search = "?[redacted]";
  const sanitizedPath = url.pathname.length > 200 ? `${url.pathname.slice(0, 200)}…` : url.pathname;
  return `${url.origin}${sanitizedPath}${url.search}`;
}

export function sanitizeText(raw: string, maxLength: number): string {
  const redacted = redactContent(raw);
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
}

export function hashContent(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/evidence-sanitize.ts`
Expected: no errors.

- [ ] **Step 3: Manual verification via a throwaway script**

Create `tmp-sanitize-check.ts` in the project root (not `/tmp` — see the established Docker bind-mount convention):

```ts
import { sanitizeUrl, sanitizeText, hashContent } from "./src/lib/audit/evidence-sanitize";

console.log(sanitizeUrl("https://example.com/path?token=abc123&email=x@y.com#section"));
console.log(sanitizeText("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U failed for user@example.com id 550e8400-e29b-41d4-a716-446655440000", 500));
console.log(hashContent("<script type=\"application/ld+json\">{}</script>").length);
```

Run: `docker-compose run --rm web npx tsx /app/tmp-sanitize-check.ts`
Expected: first line shows `https://example.com/path?[redacted]` (no fragment, no query); second line shows the Bearer token, email, and UUID all replaced with `[redacted-*]` markers; third line prints `64` (sha256 hex length).

Delete the throwaway script: `rm tmp-sanitize-check.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/evidence-sanitize.ts
git commit -m "feat: add centralized evidence sanitizer"
```

---

### Task 3: Zod schema for runtime validation

**Files:**
- Create: `src/lib/audit/evidence-schema.ts`

**Interfaces:**
- Consumes: every type from `src/lib/audit/evidence-types.ts` (Task 1).
- Produces: `AuditEvidenceV2Schema: z.ZodType<AuditEvidenceV2>` — used by Task 13 (`saveScan` caller) and Task 14 (`db/audits.ts` read path).

- [ ] **Step 1: Write the schema**

```ts
// src/lib/audit/evidence-schema.ts
import { z } from "zod";

const evidenceStatus = z.enum(["verified", "inferred", "not-assessed"]);
const boundingBox = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });

const testExecutionRecord = z.object({
  id: z.enum(["desktop-dom", "mobile-dom", "cta-journey-desktop", "cta-journey-mobile", "cookie-banner-desktop", "cookie-banner-mobile", "cookie-banner-screenshot-upload", "seo-extraction", "console-network-desktop", "console-network-mobile", "lighthouse-lab"]),
  status: z.enum(["passed", "failed", "skipped"]),
  reason: z.string().max(500).optional(),
});

const methodology = z.object({
  contractVersion: z.literal(2),
  startedAt: z.string(),
  finishedAt: z.string(),
  requestedUrl: z.string().max(2000),
  finalUrl: z.string().max(2000),
  pageGoal: z.string().max(500),
  scope: z.literal("single-page"),
  viewports: z.object({ desktop: z.object({ width: z.number(), height: z.number() }), mobile: z.object({ width: z.number(), height: z.number() }) }),
  userAgent: z.object({ desktop: z.string().max(300), mobile: z.string().max(300) }),
  tool: z.object({ lighthouseVersion: z.string().max(50) }),
  redirects: z.array(z.object({ from: z.string().max(2000), to: z.string().max(2000), status: z.number() })).max(20),
  tests: z.array(testExecutionRecord).max(20),
  limitations: z.array(z.string().max(300)).max(20),
});

const overlapCandidate = z.object({ selector: z.string().max(300), overlapsWithSelector: z.string().max(300), issue: z.enum(["cutoff", "overlap"]), boundingBox });
const smallTapTargetCandidate = z.object({ selector: z.string().max(300), boundingBox, widthPx: z.number(), heightPx: z.number() });

const cookieBannerEvidence = z.object({
  detected: z.boolean(),
  dismissAttempted: z.boolean(),
  dismissed: z.boolean(),
  blocking: z.boolean().nullable(),
  blockingStatus: evidenceStatus,
  buttonsFound: z.array(z.string().max(200)).max(10),
  screenshotBeforeDismiss: z.string().max(500).optional(),
  screenshotAfterDismiss: z.string().max(500).optional(),
});

const ctaJourneyEvidence = z.object({
  text: z.string().max(300),
  element: z.string().max(50),
  declaredUrl: z.string().max(2000),
  sameOrigin: z.boolean(),
  navigationAttempted: z.boolean(),
  finalUrl: z.string().max(2000).optional(),
  redirectCount: z.number().optional(),
  httpStatus: z.number().optional(),
  outcome: z.enum(["navigated", "redirected", "http-error", "network-error", "external-not-visited", "skipped-limit", "skipped-invalid-url"]),
  screenshotRef: z.string().max(500).optional(),
  error: z.string().max(500).optional(),
  skippedReason: z.string().max(500).optional(),
});

const browserEvidence = z.object({
  viewport: z.enum(["desktop", "mobile"]),
  headline: z.string().max(500).nullable(),
  headingHierarchy: z.array(z.object({ level: z.number(), text: z.string().max(500) })).max(80),
  aboveFold: z.object({ text: z.string().max(5000), ctaTexts: z.array(z.string().max(300)).max(50), imageCount: z.number() }),
  ctasVisible: z.array(z.object({ text: z.string().max(300), href: z.string().max(2000), tag: z.string().max(20), position: z.enum(["above-fold", "below-fold"]) })).max(50),
  navPresent: z.boolean(),
  hasHorizontalOverflow: z.boolean().nullable(),
  overlapCandidates: z.array(overlapCandidate).max(30).nullable(),
  overlapCandidatesStatus: evidenceStatus,
  smallTapTargetCandidates: z.array(smallTapTargetCandidate).max(30).nullable(),
  smallTapTargetCandidatesStatus: evidenceStatus,
  forms: z.array(z.object({ action: z.string().max(2000), inputs: z.array(z.object({ name: z.string().max(200), type: z.string().max(50), hasLabel: z.boolean() })).max(30) })).max(20),
  landmarks: z.object({ hasNav: z.boolean(), hasFooter: z.boolean(), hasMain: z.boolean() }),
  images: z.array(z.object({ src: z.string().max(2000), hasAlt: z.boolean(), aboveFold: z.boolean() })).max(50),
  cookieBanner: cookieBannerEvidence,
});

const consoleNetworkEvidence = z.object({
  consoleErrors: z.array(z.object({ message: z.string().max(500), timestamp: z.string() })).max(20),
  pageErrors: z.array(z.object({ message: z.string().max(500), timestamp: z.string() })).max(20),
  failedRequests: z.array(z.object({ url: z.string().max(500), resourceType: z.string().max(50), domain: z.string().max(300), status: z.number().nullable(), message: z.string().max(500).optional() })).max(20),
  limits: z.object({ maxConsoleErrors: z.number(), maxFailedRequests: z.number(), truncated: z.boolean() }),
});

// Capped at 50, matching ExtractedPage.ctas' own extraction cap — this records every
// candidate (tested + skipped-limit + skipped-invalid-url), not only the 5 actually
// navigated, so it is deliberately larger than the "5 tested" navigation cap.
const viewportEvidence = z.object({ browser: browserEvidence, console: consoleNetworkEvidence, ctaJourneys: z.array(ctaJourneyEvidence).max(50).nullable() });

const jsonLdEvidence = z.object({
  parsed: z.boolean(),
  types: z.array(z.string().max(100)).max(20),
  parseError: z.string().max(300).optional(),
  excerptHash: z.string().length(64),
  sanitizedExcerpt: z.string().max(500).optional(),
  contentMatch: z.boolean().nullable(),
  contentMatchStatus: evidenceStatus,
});

const seoEvidence = z.object({
  title: z.string().max(500),
  metaDescription: z.string().max(1000).nullable(),
  canonical: z.string().max(2000).nullable(),
  robotsMeta: z.string().max(300).nullable(),
  xRobotsTag: z.string().max(300).nullable(),
  htmlLang: z.string().max(50).nullable(),
  viewportMeta: z.string().max(300).nullable(),
  headings: z.array(z.object({ level: z.number(), text: z.string().max(500) })).max(80),
  hreflang: z.array(z.object({ lang: z.string().max(50), href: z.string().max(2000) })).max(50),
  openGraph: z.array(z.object({ property: z.string().max(100), content: z.string().max(1000) })).max(30),
  jsonLd: z.array(jsonLdEvidence).max(10),
  links: z.array(z.object({ text: z.string().max(300), href: z.string().max(2000), sameOrigin: z.boolean() })).max(150),
  pageStatus: z.object({ initialStatus: z.number().nullable(), finalStatus: z.number().nullable(), redirectChain: z.array(z.object({ from: z.string().max(2000), to: z.string().max(2000), status: z.number() })).max(20) }),
});

const performanceEvidence = z.object({
  lab: z.object({ lcp: z.number().nullable(), cls: z.number().nullable(), tbt: z.number().nullable(), ttfb: z.number().nullable(), source: z.literal("lighthouse"), lighthouseVersion: z.string().max(50) }),
  field: z.object({
    source: z.enum(["not-integrated", "crux"]),
    status: z.enum(["not-assessed", "insufficient-data", "available"]),
    percentile: z.literal(75).nullable(),
    periodDays: z.number().nullable(),
    lcp: z.number().nullable(),
    cls: z.number().nullable(),
    inp: z.number().nullable(),
  }),
  testConditions: z.object({
    formFactor: z.enum(["desktop", "mobile"]),
    throttlingMethod: z.string().max(100).nullable(),
    cpuThrottling: z.string().max(100).nullable(),
    networkProfile: z.string().max(100).nullable(),
    locale: z.string().max(20),
    lighthouseVersion: z.string().max(50),
    runCount: z.number(),
    limitations: z.array(z.string().max(300)).max(10),
  }),
});

const accessibilityEvidence = z.object({
  standard: z.literal("WCAG 2.2"),
  automatedChecks: z.object({ source: z.literal("lighthouse"), score: z.number(), failedAudits: z.array(z.object({ id: z.string().max(100), title: z.string().max(300), impact: z.string().max(50).optional() })).max(30) }),
  browserObservations: z.object({ imagesWithoutAlt: z.number(), formInputsWithoutLabel: z.number(), landmarksPresent: z.array(z.string().max(50)).max(10) }),
  requiresHumanVerification: z.array(z.string().max(200)).max(20),
});

export const AuditEvidenceV2Schema = z.object({
  contractVersion: z.literal(2),
  methodology,
  seo: seoEvidence,
  desktop: viewportEvidence,
  mobile: viewportEvidence,
  performance: performanceEvidence,
  accessibility: accessibilityEvidence,
});
```

- [ ] **Step 2: Typecheck**

Run: `docker-compose run --rm web npx tsc --noEmit`
Expected: no errors. (This also structurally confirms the schema's inferred type is assignable where `AuditEvidenceV2` is expected — a mismatch here would be a compile error at the usage sites added in later tasks, so full cross-checking happens then; for now, this task only needs the file itself to compile.)

- [ ] **Step 3: Manual verification via a throwaway script**

Create `tmp-schema-check.ts` in the project root:

```ts
import { AuditEvidenceV2Schema } from "./src/lib/audit/evidence-schema";

const valid = {
  contractVersion: 2, methodology: { contractVersion: 2, startedAt: "2026-07-11T00:00:00.000Z", finishedAt: "2026-07-11T00:01:00.000Z", requestedUrl: "https://example.com", finalUrl: "https://example.com/", pageGoal: "signups", scope: "single-page", viewports: { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } }, userAgent: { desktop: "d", mobile: "m" }, tool: { lighthouseVersion: "12.8.2" }, redirects: [], tests: [{ id: "desktop-dom", status: "passed" }], limitations: [] },
  seo: { title: "t", metaDescription: null, canonical: null, robotsMeta: null, xRobotsTag: null, htmlLang: null, viewportMeta: null, headings: [], hreflang: [], openGraph: [], jsonLd: [], links: [], pageStatus: { initialStatus: 200, finalStatus: 200, redirectChain: [] } },
  desktop: { browser: { viewport: "desktop", headline: null, headingHierarchy: [], aboveFold: { text: "", ctaTexts: [], imageCount: 0 }, ctasVisible: [], navPresent: false, hasHorizontalOverflow: null, overlapCandidates: null, overlapCandidatesStatus: "not-assessed", smallTapTargetCandidates: null, smallTapTargetCandidatesStatus: "not-assessed", forms: [], landmarks: { hasNav: false, hasFooter: false, hasMain: false }, images: [], cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] } }, console: { consoleErrors: [], pageErrors: [], failedRequests: [], limits: { maxConsoleErrors: 20, maxFailedRequests: 20, truncated: false } }, ctaJourneys: [] },
  mobile: { browser: { viewport: "mobile", headline: null, headingHierarchy: [], aboveFold: { text: "", ctaTexts: [], imageCount: 0 }, ctasVisible: [], navPresent: false, hasHorizontalOverflow: null, overlapCandidates: null, overlapCandidatesStatus: "not-assessed", smallTapTargetCandidates: null, smallTapTargetCandidatesStatus: "not-assessed", forms: [], landmarks: { hasNav: false, hasFooter: false, hasMain: false }, images: [], cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] } }, console: { consoleErrors: [], pageErrors: [], failedRequests: [], limits: { maxConsoleErrors: 20, maxFailedRequests: 20, truncated: false } }, ctaJourneys: null },
  performance: { lab: { lcp: null, cls: null, tbt: null, ttfb: null, source: "lighthouse", lighthouseVersion: "12.8.2" }, field: { source: "not-integrated", status: "not-assessed", percentile: null, periodDays: null, lcp: null, cls: null, inp: null }, testConditions: { formFactor: "desktop", throttlingMethod: null, cpuThrottling: null, networkProfile: null, locale: "en-US", lighthouseVersion: "12.8.2", runCount: 1, limitations: ["single lab run"] } },
  accessibility: { standard: "WCAG 2.2", automatedChecks: { source: "lighthouse", score: 90, failedAudits: [] }, browserObservations: { imagesWithoutAlt: 0, formInputsWithoutLabel: 0, landmarksPresent: [] }, requiresHumanVerification: ["keyboard trap testing"] },
};

console.log("valid parse:", AuditEvidenceV2Schema.safeParse(valid).success);
console.log("invalid parse (missing field):", AuditEvidenceV2Schema.safeParse({ ...valid, seo: undefined }).success);
console.log("invalid parse (blocking as string, not bool|null):", AuditEvidenceV2Schema.safeParse({ ...valid, desktop: { ...valid.desktop, browser: { ...valid.desktop.browser, cookieBanner: { ...valid.desktop.browser.cookieBanner, blocking: "yes" } } } }).success);
```

Run: `docker-compose run --rm web npx tsx /app/tmp-schema-check.ts`
Expected: `valid parse: true`, both invalid cases `false`.

Delete the throwaway script: `rm tmp-schema-check.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/evidence-schema.ts
git commit -m "feat: add Zod runtime schema for Evidence Contract v2"
```

---

### Task 4: Legacy derivation functions

**Files:**
- Create: `src/lib/audit/evidence-legacy.ts`

**Interfaces:**
- Consumes: `CookieBannerEvidence`, `CtaJourneyEvidence` (Task 1).
- Produces: `deriveLegacyCookieBanner`, `deriveLegacyCtaJourneys` — used by Task 13.

- [ ] **Step 1: Write the derivation functions**

```ts
// src/lib/audit/evidence-legacy.ts
import type { CookieBannerEvidence, CtaJourneyEvidence } from "@/lib/audit/evidence-types";
import type { ExtractedPage } from "@/lib/audit/types";

export function deriveLegacyCookieBanner(evidence: CookieBannerEvidence): ExtractedPage["cookieBanner"] {
  return { detected: evidence.detected, dismissed: evidence.dismissed };
}

export function deriveLegacyCtaJourneys(evidence: CtaJourneyEvidence[]): ExtractedPage["ctaJourneys"] {
  return evidence.map((journey) => ({
    text: journey.text,
    destination: journey.finalUrl ?? journey.declaredUrl,
    outcome: legacyOutcomeText(journey),
    sameOrigin: journey.sameOrigin,
    screenshotPath: journey.screenshotRef,
  }));
}

function legacyOutcomeText(journey: CtaJourneyEvidence): string {
  switch (journey.outcome) {
    case "navigated":
      return `Loaded: ${journey.finalUrl ?? journey.declaredUrl}`;
    case "redirected":
      return `Loaded after redirect: ${journey.finalUrl ?? journey.declaredUrl}`;
    case "http-error":
      return `HTTP ${journey.httpStatus ?? "error"}`;
    case "network-error":
      return journey.error ?? "Could not load";
    case "external-not-visited":
      return "External destination detected";
    case "skipped-limit":
      return "Not tested — audit is capped at the first 5 conversion paths";
    case "skipped-invalid-url":
      return "Not tested — invalid or unsupported URL";
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/evidence-legacy.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/audit/evidence-legacy.ts
git commit -m "feat: derive legacy cookieBanner/ctaJourneys fields from v2 evidence"
```

---

### Task 5: Browser scanner — per-viewport `extract()` and geometry candidates

**Files:**
- Modify: `src/lib/audit/browser-scanner.ts`

**Interfaces:**
- Consumes: `BrowserEvidence`, `OverlapCandidate`, `SmallTapTargetCandidate` (Task 1).
- Produces: a new `extractEvidence(page: Page, viewport: "desktop" | "mobile"): Promise<BrowserEvidence>` function, called once per viewport by `scanHomepage()`. The existing `extract()` (legacy `ExtractedPage` shape) stays desktop-only and unchanged in this task — Task 6/7 will feed it from the new evidence rather than duplicating logic.

- [ ] **Step 1: Add `extractEvidence()` to `browser-scanner.ts`**

Insert after the existing `extract()` function (currently ending at line 85):

```ts
async function extractEvidence(page: Page, viewport: "desktop" | "mobile"): Promise<import("@/lib/audit/evidence-types").BrowserEvidence> {
  const geometry = await page.evaluate(() => {
    const rects = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    const hasHorizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;

    const overlapCandidates: { selector: string; overlapsWithSelector: string; issue: "cutoff" | "overlap"; boundingBox: { x: number; y: number; width: number; height: number } }[] = [];
    const describeSelector = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`;
    const sample = rects.slice(0, 400);
    for (let i = 0; i < sample.length; i += 1) {
      const a = sample[i];
      const aRect = a.getBoundingClientRect();
      const parent = a.parentElement;
      if (parent) {
        const pRect = parent.getBoundingClientRect();
        if (aRect.right > pRect.right + 2 || aRect.bottom > pRect.bottom + 2) {
          overlapCandidates.push({ selector: describeSelector(a), overlapsWithSelector: describeSelector(parent), issue: "cutoff", boundingBox: { x: aRect.x, y: aRect.y, width: aRect.width, height: aRect.height } });
        }
      }
      if (overlapCandidates.length >= 30) break;
    }

    const smallTapTargetCandidates: { selector: string; boundingBox: { x: number; y: number; width: number; height: number }; widthPx: number; heightPx: number }[] = [];
    const interactive = rects.filter((el) => el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.tagName === "INPUT");
    for (const el of interactive.slice(0, 200)) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) {
        smallTapTargetCandidates.push({ selector: describeSelector(el), boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height }, widthPx: Math.round(r.width), heightPx: Math.round(r.height) });
      }
      if (smallTapTargetCandidates.length >= 30) break;
    }

    const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (el: Element) => rects.includes(el);
    const headingHierarchy = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((node) => ({ level: Number(node.tagName[1]), text: clean(node.textContent) })).filter((item) => item.text).slice(0, 80);
    const headline = headingHierarchy.find((h) => h.level === 1)?.text ?? headingHierarchy[0]?.text ?? null;
    const ctaNodes = [...document.querySelectorAll("button,a[href]")].filter(visible);
    const ctasVisible = ctaNodes.map((node) => ({ text: clean(node.textContent), href: node instanceof HTMLAnchorElement ? node.href : "", tag: node.tagName.toLowerCase(), position: (node.getBoundingClientRect().top < window.innerHeight ? "above-fold" : "below-fold") as "above-fold" | "below-fold" })).filter((c) => c.text).slice(0, 50);
    const foldNodes = rects.filter((node) => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight && node.children.length === 0; });
    const aboveFoldText = clean(foldNodes.map((n) => n.textContent).join(" ")).slice(0, 5000);
    const aboveFoldCtas = ctasVisible.filter((c) => c.position === "above-fold").map((c) => c.text);
    const imageCount = [...document.images].filter((img) => img.getBoundingClientRect().top < window.innerHeight).length;
    const forms = [...document.forms].map((form) => ({
      action: form.action,
      inputs: [...form.elements].map((field) => {
        const input = field as HTMLInputElement;
        const hasLabel = Boolean(input.labels?.length) || Boolean(input.getAttribute("aria-label")) || Boolean(input.getAttribute("aria-labelledby"));
        return { name: input.name || "", type: input.type || input.tagName.toLowerCase(), hasLabel };
      }).slice(0, 30),
    })).slice(0, 20);
    const images = [...document.images].slice(0, 50).map((img) => ({ src: img.src, hasAlt: img.alt.trim().length > 0, aboveFold: img.getBoundingClientRect().top < window.innerHeight }));

    return {
      hasHorizontalOverflow,
      overlapCandidates,
      smallTapTargetCandidates,
      headline,
      headingHierarchy,
      ctasVisible,
      navPresent: Boolean(document.querySelector("nav")),
      aboveFold: { text: aboveFoldText, ctaTexts: aboveFoldCtas, imageCount },
      forms,
      landmarks: { hasNav: Boolean(document.querySelector("nav")), hasFooter: Boolean(document.querySelector("footer")), hasMain: Boolean(document.querySelector("main")) },
      images,
    };
  });

  return {
    viewport,
    headline: geometry.headline,
    headingHierarchy: geometry.headingHierarchy,
    aboveFold: geometry.aboveFold,
    ctasVisible: geometry.ctasVisible,
    navPresent: geometry.navPresent,
    hasHorizontalOverflow: geometry.hasHorizontalOverflow,
    overlapCandidates: geometry.overlapCandidates,
    overlapCandidatesStatus: "verified",
    smallTapTargetCandidates: viewport === "mobile" ? geometry.smallTapTargetCandidates : null,
    smallTapTargetCandidatesStatus: viewport === "mobile" ? "verified" : "not-assessed",
    forms: geometry.forms,
    landmarks: geometry.landmarks,
    images: geometry.images,
    cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] },
  };
}
```

Note: `cookieBanner` here is a placeholder default — Task 6 replaces it with the real detect/dismiss result before `extractEvidence()`'s return value is used.

- [ ] **Step 2: Wrap geometry extraction in a try/catch inside `scanHomepage()` (not yet wired — this step only prepares the call sites)**

This task only adds the function; Task 6 and Task 13 wire it into `scanHomepage()`'s control flow (since the cookie-banner detect step must run first and be merged in). Leave `extractEvidence` unused-but-exported for now — TypeScript won't error on an unused top-level function in this codebase's `tsconfig` (`noUnusedLocals` is not set for exported functions); confirm via the typecheck in Step 3.

- [ ] **Step 3: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: add per-viewport evidence extraction with geometry candidates"
```

---

### Task 6: Cookie banner — detect/dismiss split and blocking check

**Files:**
- Modify: `src/lib/audit/browser-scanner.ts`

**Interfaces:**
- Consumes: `CookieBannerEvidence` (Task 1).
- Produces: `detectAndDismissCookieBanner(page: Page): Promise<CookieBannerEvidence & { beforeScreenshot?: Buffer; afterScreenshot?: Buffer }>`, replacing calls to the old `dismissCookieBanner()`.

- [ ] **Step 1: Replace `dismissCookieBanner()` with the split detect/dismiss/blocking function**

Replace the existing `dismissCookieBanner` function (lines 9-21) with:

```ts
async function detectAndDismissCookieBanner(page: Page): Promise<{ evidence: import("@/lib/audit/evidence-types").CookieBannerEvidence; beforeScreenshot?: Buffer; afterScreenshot?: Buffer }> {
  const detection = await page.evaluate((patterns: string[]) => {
    const regexes = patterns.map((p) => new RegExp(p, "i"));
    const candidates = [...document.querySelectorAll("[class*=cookie i],[id*=cookie i],[class*=consent i],[id*=consent i],[role=dialog]")];
    const banner = candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    if (!banner) return { detected: false, buttonsFound: [] as string[], blocking: null as boolean | null };
    const buttons = [...banner.querySelectorAll("button,a[role=button],a")].map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 10);
    const style = window.getComputedStyle(banner);
    const rect = banner.getBoundingClientRect();
    const coversMost = rect.width >= window.innerWidth * 0.6 && rect.height >= window.innerHeight * 0.6;
    const isFixedOrSticky = style.position === "fixed" || style.position === "sticky";
    const bodyLocked = window.getComputedStyle(document.body).overflow === "hidden";
    const blocking = (coversMost && isFixedOrSticky) || bodyLocked;
    return { detected: true, buttonsFound: buttons, blocking, matchedButton: buttons.find((label) => regexes.some((re) => re.test(label))) ?? null };
  }, COOKIE_CONSENT_PATTERNS.map((p) => p.source));

  if (!detection.detected) {
    return { evidence: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] } };
  }

  let beforeScreenshot: Buffer | undefined;
  try { beforeScreenshot = Buffer.from(await page.screenshot({ type: "jpeg", quality: 70 })); } catch { /* screenshot best-effort */ }

  let dismissed = false;
  for (const pattern of COOKIE_CONSENT_PATTERNS) {
    const button = page.getByRole("button", { name: pattern }).first();
    try {
      if (await button.isVisible({ timeout: 400 })) {
        await button.click({ timeout: 1500 });
        await page.waitForTimeout(400);
        dismissed = true;
        break;
      }
    } catch { /* pattern not present, try the next one */ }
  }

  let afterScreenshot: Buffer | undefined;
  try { afterScreenshot = Buffer.from(await page.screenshot({ type: "jpeg", quality: 70 })); } catch { /* screenshot best-effort */ }

  return {
    evidence: {
      detected: true,
      dismissAttempted: true,
      dismissed,
      blocking: detection.blocking,
      blockingStatus: detection.blocking === null ? "not-assessed" : "verified",
      buttonsFound: detection.buttonsFound,
    },
    beforeScreenshot,
    afterScreenshot,
  };
}
```

- [ ] **Step 2: Update `scanHomepage()`'s desktop pass to use the new function**

In `scanHomepage()`, replace:

```ts
const cookieDismissedDesktop = await dismissCookieBanner(desktopPage);
const pageData = await extract(desktopPage);
pageData.cookieBanner = { detected: cookieDismissedDesktop, dismissed: cookieDismissedDesktop };
```

with:

```ts
const cookieDesktop = await detectAndDismissCookieBanner(desktopPage);
const pageData = await extract(desktopPage);
pageData.cookieBanner = deriveLegacyCookieBanner(cookieDesktop.evidence);
```

(Add `import { deriveLegacyCookieBanner } from "@/lib/audit/evidence-legacy";` to `browser-scanner.ts`'s imports — this is the same single-source-of-truth derivation function from Task 4, not a second inline computation.)

And replace the mobile pass's:

```ts
await dismissCookieBanner(mobilePage);
```

with:

```ts
const cookieMobile = await detectAndDismissCookieBanner(mobilePage);
```

(`cookieDesktop`/`cookieMobile` are consumed fully in Task 13, where `scanHomepage()`'s return type gains the evidence/screenshot fields — this task only makes the detect/dismiss call itself correct and typed; leaving the variables assigned-but-not-yet-returned is fine, confirmed by the typecheck below not erroring on unused locals since they're consumed in the same function scope trivially via the assignment — if `tsc`/`eslint` flag them as unused because nothing reads them yet within this task, add a temporary `void cookieDesktop; void cookieMobile;` line after each, removed again in Task 13 once they're threaded into the return value.)

- [ ] **Step 3: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts`
Expected: no errors (add the temporary `void` lines from Step 2's note if `no-unused-vars` fires).

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: split cookie banner detection from dismissal, add blocking check"
```

---

### Task 7: CTA journeys — typed outcome, redirect chain, per-hop SSRF revalidation

**Files:**
- Modify: `src/lib/audit/browser-scanner.ts`

**Interfaces:**
- Consumes: `CtaJourneyEvidence`, `CtaOutcome` (Task 1).
- Produces: `testCtaJourneysEvidence(context, sourceUrl, ctas): Promise<{ evidence: CtaJourneyEvidence; screenshot?: Buffer }[]>`, replacing `testCtaJourneys()`.

- [ ] **Step 1: Replace `testCtaJourneys()`**

Replace the existing `testCtaJourneys` function (lines 87-105) with:

```ts
async function countRedirects(response: import("playwright").Response | null): Promise<number> {
  let count = 0;
  let current = response?.request().redirectedFrom() ?? null;
  while (current) {
    count += 1;
    current = current.redirectedFrom();
  }
  return count;
}

async function testCtaJourneysEvidence(context: BrowserContext, sourceUrl: string, ctas: ExtractedPage["ctas"]): Promise<{ evidence: import("@/lib/audit/evidence-types").CtaJourneyEvidence; screenshot?: Buffer }[]> {
  const source = new URL(sourceUrl);
  const httpCandidates = ctas.filter((cta) => {
    try { return ["http:", "https:"].includes(new URL(cta.href, source).protocol); } catch { return false; }
  });
  const invalidCandidates = ctas.filter((cta) => !httpCandidates.includes(cta));
  const tested = httpCandidates.slice(0, 5);
  const overLimit = httpCandidates.slice(5);

  const testedResults = await Promise.all(tested.map(async (cta) => {
    const destination = new URL(cta.href, source);
    const sameOrigin = destination.origin === source.origin;
    if (!sameOrigin) {
      return { evidence: { text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin, navigationAttempted: false, outcome: "external-not-visited" as const, skippedReason: "External destination — not navigated in this audit" } };
    }
    const probe = await context.newPage();
    try {
      const response = await probe.goto(destination.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 });
      await assertSafeUrl(probe.url());
      const redirectCount = await countRedirects(response);
      const screenshot = response?.ok() ? Buffer.from(await probe.screenshot({ type: "jpeg", quality: 70 })) : undefined;
      const outcome: import("@/lib/audit/evidence-types").CtaOutcome = !response ? "network-error" : !response.ok() ? "http-error" : redirectCount > 0 ? "redirected" : "navigated";
      return {
        evidence: { text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin, navigationAttempted: true, finalUrl: probe.url(), redirectCount, httpStatus: response?.status(), outcome },
        screenshot,
      };
    } catch (error) {
      return { evidence: { text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin, navigationAttempted: true, outcome: "network-error" as const, error: error instanceof Error ? error.message : "Could not load" } };
    } finally {
      await probe.close();
    }
  }));

  const overLimitResults = overLimit.map((cta) => {
    const destination = new URL(cta.href, source);
    return { evidence: { text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin: destination.origin === source.origin, navigationAttempted: false, outcome: "skipped-limit" as const, skippedReason: "Not tested — audit is capped at the first 5 conversion paths" } };
  });

  const invalidResults = invalidCandidates.map((cta) => ({
    evidence: { text: cta.text, element: cta.tag, declaredUrl: cta.href, sameOrigin: false, navigationAttempted: false, outcome: "skipped-invalid-url" as const, skippedReason: "Not tested — not an http(s) destination" },
  }));

  return [...testedResults, ...overLimitResults, ...invalidResults];
}
```

Every redirect hop is already re-validated because `assertSafeUrl(probe.url())` runs on the **final** URL after Playwright follows the full redirect chain, and `secureContext()`'s existing `context.route("**/*", ...)` handler (lines 29-36, unchanged) calls `assertSafeUrl` on **every** request the context makes — including each intermediate redirect hop, not just the final one, since Playwright's route interception fires per-request, not just for the top-level navigation. This is what the Task 16 fixture's redirect-to-private-address case proves in a live run.

- [ ] **Step 2: Update `scanHomepage()` to use the new function**

Replace:

```ts
const ctaResults = await testCtaJourneys(desktop, pageData.url, pageData.ctas);
pageData.ctaJourneys = ctaResults.map((result) => ({ text: result.text, destination: result.destination, outcome: result.outcome, sameOrigin: result.sameOrigin }));
const ctaScreenshots = ctaResults
  .map((result, index) => ({ index, buffer: result.screenshot }))
  .filter((entry): entry is { index: number; buffer: Buffer } => Boolean(entry.buffer));
```

with:

```ts
const ctaResults = await testCtaJourneysEvidence(desktop, pageData.url, pageData.ctas);
const { deriveLegacyCtaJourneys } = await import("@/lib/audit/evidence-legacy");
pageData.ctaJourneys = deriveLegacyCtaJourneys(ctaResults.map((r) => r.evidence));
const ctaScreenshots = ctaResults
  .map((result, index) => ({ index, buffer: result.screenshot }))
  .filter((entry): entry is { index: number; buffer: Buffer } => Boolean(entry.buffer));
```

(A dynamic `import()` is used here only because `evidence-legacy.ts` is a small leaf module with no circular dependency risk back to `browser-scanner.ts`; a normal top-of-file `import` is equally correct and preferred — use a regular static `import { deriveLegacyCtaJourneys } from "@/lib/audit/evidence-legacy";` at the top of `browser-scanner.ts` instead, matching the file's existing import style.)

- [ ] **Step 3: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: typed CTA outcomes with redirect count and per-hop SSRF revalidation"
```

---

### Task 8: SEO evidence extraction

**Files:**
- Modify: `src/lib/audit/browser-scanner.ts`

**Interfaces:**
- Consumes: `SeoEvidence`, `JsonLdEvidence` (Task 1), `sanitizeUrl`/`hashContent`/`sanitizeText` (Task 2).
- Produces: `extractSeoEvidence(page: Page, response: import("playwright").Response | null): Promise<SeoEvidence>`.

- [ ] **Step 1: Extend `settle()` to return the navigation `Response`**

Replace:

```ts
async function settle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
}
```

with:

```ts
async function settle(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  return response;
}
```

Update both call sites in `scanHomepage()` to capture the return value: `const desktopResponse = await settle(desktopPage, url);` and `const mobileResponse = await settle(mobilePage, pageData.url);`.

- [ ] **Step 2: Add `extractSeoEvidence()`**

```ts
import { sanitizeUrl, sanitizeText, hashContent } from "@/lib/audit/evidence-sanitize";

async function extractSeoEvidence(page: Page, response: import("playwright").Response | null): Promise<import("@/lib/audit/evidence-types").SeoEvidence> {
  const raw = await page.evaluate(() => {
    const attr = (selector: string, name: string) => document.querySelector(selector)?.getAttribute(name) ?? null;
    const canonical = attr('link[rel="canonical"]', "href");
    const robotsMeta = attr('meta[name="robots"]', "content");
    const htmlLang = document.documentElement.getAttribute("lang");
    const viewportMeta = attr('meta[name="viewport"]', "content");
    const hreflang = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((el) => ({ lang: el.getAttribute("hreflang") ?? "", href: (el as HTMLLinkElement).href })).slice(0, 50);
    const openGraph = [...document.querySelectorAll('meta[property^="og:"]')].map((el) => ({ property: el.getAttribute("property") ?? "", content: el.getAttribute("content") ?? "" })).slice(0, 30);
    const jsonLdScripts = [...document.querySelectorAll('script[type="application/ld+json"]')].map((el) => el.textContent ?? "").slice(0, 10);
    const links = [...document.querySelectorAll("a[href]")].map((el) => ({ text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), href: (el as HTMLAnchorElement).href })).slice(0, 150);
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((el) => ({ level: Number(el.tagName[1]), text: (el.textContent ?? "").replace(/\s+/g, " ").trim() })).filter((h) => h.text).slice(0, 80);
    return { canonical, robotsMeta, htmlLang, viewportMeta, hreflang, openGraph, jsonLdScripts, links, headings, title: document.title, metaDescription: attr('meta[name="description"]', "content"), visibleText: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 30_000) };
  });

  const matchableTypes = new Set(["Product", "Article"]);
  const jsonLd: import("@/lib/audit/evidence-types").JsonLdEvidence[] = raw.jsonLdScripts.map((script) => {
    const excerptHash = hashContent(script);
    try {
      const parsedJson = JSON.parse(script) as Record<string, unknown> & { "@type"?: string | string[] };
      const types = Array.isArray(parsedJson["@type"]) ? (parsedJson["@type"] as string[]) : parsedJson["@type"] ? [parsedJson["@type"] as string] : [];
      const matchableType = types.find((t) => matchableTypes.has(t));
      let contentMatch: boolean | null = null;
      let contentMatchStatus: import("@/lib/audit/evidence-types").EvidenceStatus = "not-assessed";
      if (matchableType) {
        const nameField = (parsedJson.name ?? parsedJson.headline) as string | undefined;
        if (typeof nameField === "string" && nameField.trim()) {
          contentMatch = raw.visibleText.includes(nameField.trim());
          contentMatchStatus = "verified";
        }
      }
      return { parsed: true, types, excerptHash, sanitizedExcerpt: sanitizeText(script, 400), contentMatch, contentMatchStatus };
    } catch (error) {
      return { parsed: false, types: [], parseError: sanitizeText(error instanceof Error ? error.message : "Invalid JSON-LD", 300), excerptHash, contentMatch: null, contentMatchStatus: "not-assessed" as const };
    }
  });

  const redirectChain: { from: string; to: string; status: number }[] = [];
  let current = response?.request().redirectedFrom() ?? null;
  let previousUrl = response?.url();
  while (current && redirectChain.length < 20) {
    const currentResponse = await current.response();
    if (currentResponse && previousUrl) redirectChain.unshift({ from: sanitizeUrl(current.url()), to: sanitizeUrl(previousUrl), status: currentResponse.status() });
    previousUrl = current.url();
    current = current.redirectedFrom();
  }

  return {
    title: raw.title,
    metaDescription: raw.metaDescription,
    canonical: raw.canonical,
    robotsMeta: raw.robotsMeta,
    xRobotsTag: response?.headers()["x-robots-tag"] ?? null,
    htmlLang: raw.htmlLang,
    viewportMeta: raw.viewportMeta,
    headings: raw.headings,
    hreflang: raw.hreflang,
    openGraph: raw.openGraph,
    jsonLd,
    links: raw.links.map((link) => ({ text: link.text, href: sanitizeUrl(link.href), sameOrigin: (() => { try { return new URL(link.href).origin === new URL(raw.canonical ?? response?.url() ?? "").origin; } catch { return false; } })() })),
    pageStatus: { initialStatus: redirectChain[0]?.status ?? response?.status() ?? null, finalStatus: response?.status() ?? null, redirectChain },
  };
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: extract SEO evidence (canonical, robots, hreflang, OG, JSON-LD, redirect chain)"
```

---

### Task 9: Console and network evidence capture

**Files:**
- Modify: `src/lib/audit/browser-scanner.ts`

**Interfaces:**
- Consumes: `ConsoleNetworkEvidence` (Task 1), `sanitizeUrl`/`sanitizeText` (Task 2).
- Produces: `attachConsoleNetworkCapture(page: Page): () => ConsoleNetworkEvidence` — call before navigation, invoke the returned function after settling to get the collected evidence.

- [ ] **Step 1: Add the capture function**

```ts
const MAX_CONSOLE_ERRORS = 20;
const MAX_FAILED_REQUESTS = 20;

function attachConsoleNetworkCapture(page: Page): () => import("@/lib/audit/evidence-types").ConsoleNetworkEvidence {
  const consoleErrors: { message: string; timestamp: string }[] = [];
  const pageErrors: { message: string; timestamp: string }[] = [];
  const failedRequests: { url: string; resourceType: string; domain: string; status: number | null; message?: string }[] = [];
  let truncated = false;

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (consoleErrors.length >= MAX_CONSOLE_ERRORS) { truncated = true; return; }
    consoleErrors.push({ message: sanitizeText(message.text(), 500), timestamp: new Date().toISOString() });
  });
  page.on("pageerror", (error) => {
    if (pageErrors.length >= MAX_CONSOLE_ERRORS) { truncated = true; return; }
    pageErrors.push({ message: sanitizeText(error.message, 500), timestamp: new Date().toISOString() });
  });
  page.on("requestfailed", (request) => {
    if (failedRequests.length >= MAX_FAILED_REQUESTS) { truncated = true; return; }
    let domain = "";
    try { domain = new URL(request.url()).hostname; } catch { /* ignore */ }
    failedRequests.push({ url: sanitizeUrl(request.url()), resourceType: request.resourceType(), domain, status: null, message: sanitizeText(request.failure()?.errorText ?? "Request failed", 300) });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (failedRequests.length >= MAX_FAILED_REQUESTS) { truncated = true; return; }
    let domain = "";
    try { domain = new URL(response.url()).hostname; } catch { /* ignore */ }
    failedRequests.push({ url: sanitizeUrl(response.url()), resourceType: response.request().resourceType(), domain, status: response.status() });
  });

  return () => ({
    consoleErrors: dedupe(consoleErrors),
    pageErrors: dedupe(pageErrors),
    failedRequests,
    limits: { maxConsoleErrors: MAX_CONSOLE_ERRORS, maxFailedRequests: MAX_FAILED_REQUESTS, truncated },
  });
}

function dedupe<T extends { message: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.message) ? false : (seen.add(item.message), true)));
}
```

- [ ] **Step 2: Wire the capture into both viewport passes in `scanHomepage()`**

Immediately after each `newPage()` call and before `settle()`, add:

```ts
const desktopConsoleCapture = attachConsoleNetworkCapture(desktopPage);
```

(and the equivalent `mobileConsoleCapture` for the mobile page), then after each page's `settle()` call, capture the result: `const desktopConsoleNetwork = desktopConsoleCapture();` / `const mobileConsoleNetwork = mobileConsoleCapture();`. These four new local variables are consumed in Task 13 when `scanHomepage()`'s return type is extended — until then, if `eslint`'s `no-unused-vars` fires, add temporary `void` lines as in Task 6.

- [ ] **Step 3: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: capture console errors, page errors, and failed requests per viewport"
```

---

### Task 10: Cookie screenshot lifecycle

**Files:**
- Modify: `src/lib/audit/browser-scanner.ts` (`BrowserScanResult` type, `scanHomepage()` return)
- Modify: `src/lib/storage/screenshots.ts` (new upload function)

**Interfaces:**
- Consumes: `Buffer`s from Task 6's `detectAndDismissCookieBanner()`.
- Produces: `uploadCookieBannerScreenshots(auditId, buffers): Promise<{ desktop: { before?: string; after?: string }; mobile: { before?: string; after?: string } }>`.

- [ ] **Step 1: Add the upload function**

In `src/lib/storage/screenshots.ts`, add after `uploadCtaScreenshots`:

```ts
export async function uploadCookieBannerScreenshots(auditId: string, buffers: { desktop: { before?: Buffer; after?: Buffer }; mobile: { before?: Buffer; after?: Buffer } }) {
  const bucket = process.env.SUPABASE_SCREENSHOTS_BUCKET ?? "audit-screenshots";
  const db = getSupabaseAdmin();
  const jobs: { key: "desktop.before" | "desktop.after" | "mobile.before" | "mobile.after"; buffer: Buffer; path: string }[] = [];
  if (buffers.desktop.before) jobs.push({ key: "desktop.before", buffer: buffers.desktop.before, path: `${auditId}/cookie-banner-desktop-before.jpg` });
  if (buffers.desktop.after) jobs.push({ key: "desktop.after", buffer: buffers.desktop.after, path: `${auditId}/cookie-banner-desktop-after.jpg` });
  if (buffers.mobile.before) jobs.push({ key: "mobile.before", buffer: buffers.mobile.before, path: `${auditId}/cookie-banner-mobile-before.jpg` });
  if (buffers.mobile.after) jobs.push({ key: "mobile.after", buffer: buffers.mobile.after, path: `${auditId}/cookie-banner-mobile-after.jpg` });

  const results: { desktop: { before?: string; after?: string }; mobile: { before?: string; after?: string } } = { desktop: {}, mobile: {} };
  let uploadFailed = false;
  await Promise.all(jobs.map(async (job) => {
    const { error } = await db.storage.from(bucket).upload(job.path, job.buffer, { contentType: "image/jpeg", upsert: true });
    if (error) { uploadFailed = true; return; }
    const { data } = db.storage.from(bucket).getPublicUrl(job.path);
    const [viewport, phase] = job.key.split(".") as ["desktop" | "mobile", "before" | "after"];
    results[viewport][phase] = data.publicUrl;
  }));
  return { ...results, uploadFailed };
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/storage/screenshots.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/screenshots.ts
git commit -m "feat: add cookie-banner screenshot upload with per-image failure tracking"
```

---

### Task 11: Performance evidence assembly and `lighthouse-scanner.ts` fix

**Files:**
- Modify: `src/lib/audit/lighthouse-scanner.ts`

**Interfaces:**
- Consumes: `PerformanceEvidence` (Task 1).
- Produces: `runLighthouse()` now also returns `evidence: PerformanceEvidence` alongside the existing `AuditMetrics` return value.

- [ ] **Step 1: Fix the `inpOrTbt` fallback and add evidence assembly**

Replace the `inpOrTbt` line:

```ts
inpOrTbt: numeric(audits["interaction-to-next-paint"] ?? audits["total-blocking-time"]),
```

with:

```ts
inpOrTbt: numeric(audits["total-blocking-time"]),
```

(This is the one small, spec-justified correction to existing behavior — `inpOrTbt` now always holds the same TBT-only value as `evidence.performance.lab.tbt`, never an unscripted-run INP reading passed off as one or the other.)

- [ ] **Step 2: Change the return type and assemble `PerformanceEvidence`**

Change the function signature from `Promise<AuditMetrics>` to `Promise<{ metrics: AuditMetrics; evidence: import("@/lib/audit/evidence-types").PerformanceEvidence }>`, and change the `return { ... }` statement (currently the object literal ending with `raw: lhr`) to:

```ts
const metrics: AuditMetrics = {
  performanceScore: score(lhr.categories.performance?.score),
  accessibilityScore: score(lhr.categories.accessibility?.score),
  seoScore: score(lhr.categories.seo?.score),
  bestPracticesScore: score(lhr.categories["best-practices"]?.score),
  lcp: numeric(audits["largest-contentful-paint"]),
  cls: numeric(audits["cumulative-layout-shift"]),
  inpOrTbt: numeric(audits["total-blocking-time"]),
  ttfb: numeric(audits["server-response-time"]),
  imageIssues,
  renderBlockingResources: detailItems(audits["render-blocking-resources"]).length,
  scriptWeightBytes: Number(detailItems(audits["resource-summary"]).find((item) => item.resourceType === "script")?.transferSize ?? 0),
  raw: lhr,
};

const evidence: import("@/lib/audit/evidence-types").PerformanceEvidence = {
  lab: { lcp: metrics.lcp, cls: metrics.cls, tbt: metrics.inpOrTbt, ttfb: metrics.ttfb, source: "lighthouse", lighthouseVersion: lhr.lighthouseVersion },
  field: { source: "not-integrated", status: "not-assessed", percentile: null, periodDays: null, lcp: null, cls: null, inp: null },
  testConditions: { formFactor: "desktop", throttlingMethod: null, cpuThrottling: null, networkProfile: null, locale: "en-US", lighthouseVersion: lhr.lighthouseVersion, runCount: 1, limitations: ["single lab run — not averaged across executions", "desktop viewport only"] },
};

return { metrics, evidence };
```

- [ ] **Step 3: Update `process-audit.ts`'s call site (temporary — full wiring happens in Task 13)**

In `src/lib/audit/process-audit.ts`, change:

```ts
const metrics = await runLighthouse(browserResult.page.url);
```

to:

```ts
const { metrics, evidence: performanceEvidence } = await runLighthouse(browserResult.page.url);
```

(`performanceEvidence` is consumed fully in Task 13; if unused before then, add a temporary `void performanceEvidence;`.)

- [ ] **Step 4: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/lighthouse-scanner.ts src/lib/audit/process-audit.ts`
Expected: no errors. This will surface any other `runLighthouse()` call sites expecting the old bare-`AuditMetrics` return — grep for `runLighthouse(` across `src/` and update every call site the same way.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit/lighthouse-scanner.ts src/lib/audit/process-audit.ts
git commit -m "fix: stop conflating TBT/INP in inpOrTbt, assemble PerformanceEvidence"
```

---

### Task 12: Accessibility evidence assembly

**Files:**
- Modify: `src/lib/audit/lighthouse-scanner.ts`

**Interfaces:**
- Consumes: `AccessibilityEvidence` (Task 1).
- Produces: `runLighthouse()`'s return value gains `accessibilityEvidence: AccessibilityEvidence`, sourced from the same Lighthouse `lhr` already computed in Task 11 plus the desktop `BrowserEvidence` (threaded in from Task 13, since `runLighthouse()` itself has no browser-evidence access — see Step 2).

- [ ] **Step 1: Add a Lighthouse-only accessibility assembly helper**

Add, in `lighthouse-scanner.ts`, a function that builds the Lighthouse-sourced half of `AccessibilityEvidence` (the desktop-browser-observation half is merged in by the caller in Task 13, since only `process-audit.ts` has both pieces at hand):

```ts
export function buildAutomatedAccessibilityChecks(lhr: import("lighthouse").Result): import("@/lib/audit/evidence-types").AccessibilityEvidence["automatedChecks"] {
  const accessibilityAudits = Object.values(lhr.audits).filter((audit) => lhr.categories.accessibility?.auditRefs.some((ref) => ref.id === audit.id));
  const failedAudits = accessibilityAudits.filter((audit) => audit.score !== null && Number(audit.score) < 1).map((audit) => ({ id: audit.id, title: audit.title }));
  return { source: "lighthouse", score: score(lhr.categories.accessibility?.score), failedAudits };
}
```

- [ ] **Step 2: Export it alongside `runLighthouse`**

No further change needed inside `runLighthouse()` itself for this task — Task 13 calls `buildAutomatedAccessibilityChecks(lhr)` where it has access to the raw `lhr` result (it's already returned as `metrics.raw` from Task 11's assembly) and merges it with the desktop `BrowserEvidence.images`/`.forms` counts to build the full `AccessibilityEvidence`.

- [ ] **Step 3: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/lighthouse-scanner.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/lighthouse-scanner.ts
git commit -m "feat: assemble automated-checks half of AccessibilityEvidence from Lighthouse"
```

---

### Task 13: Methodology assembly and full worker-pipeline wiring

**Files:**
- Modify: `src/lib/audit/browser-scanner.ts` (`BrowserScanResult` type, `scanHomepage()` return value)
- Modify: `src/lib/audit/process-audit.ts` (assemble `AuditEvidenceV2`, sanitize, validate, persist)

**Interfaces:**
- Consumes: everything from Tasks 1-12.
- Produces: a fully assembled, sanitized, Zod-validated `AuditEvidenceV2` attached to `browserResult.page.evidence` before `saveScan()`.

This is the integration task — every piece built in Tasks 5-12 gets threaded together here. Re-read the current `scanHomepage()`/`processNextAudit()` in full before starting (they've been touched by every prior task in this plan).

**Rethrow vs. record-and-continue, deliberately:** `desktop-dom`, `mobile-dom`, and `seo-extraction` failures are rethrown after being recorded — without a loaded desktop page there's no audit at all, so these are foundational. `cta-journey-desktop` failures are recorded but **not** rethrown — a broken conversion-path check shouldn't fail an otherwise-complete audit, so it degrades to an empty `ctaResults` and the run continues. This is why the two failure branches below look asymmetric; it's not an inconsistency to fix.

- [ ] **Step 1: Extend `BrowserScanResult` and `scanHomepage()`'s return value**

In `browser-scanner.ts`, change:

```ts
export interface BrowserScanResult { page: ExtractedPage; desktopScreenshot: Buffer; mobileScreenshot: Buffer; ctaScreenshots: { index: number; buffer: Buffer }[]; }
```

to:

```ts
export interface BrowserScanResult {
  page: ExtractedPage;
  desktopScreenshot: Buffer;
  mobileScreenshot: Buffer;
  ctaScreenshots: { index: number; buffer: Buffer }[];
  cookieBannerScreenshots: { desktop: { before?: Buffer; after?: Buffer }; mobile: { before?: Buffer; after?: Buffer } };
  evidenceParts: {
    seo: import("@/lib/audit/evidence-types").SeoEvidence;
    desktop: { browser: import("@/lib/audit/evidence-types").BrowserEvidence; console: import("@/lib/audit/evidence-types").ConsoleNetworkEvidence; ctaJourneys: import("@/lib/audit/evidence-types").CtaJourneyEvidence[] };
    mobile: { browser: import("@/lib/audit/evidence-types").BrowserEvidence; console: import("@/lib/audit/evidence-types").ConsoleNetworkEvidence };
    tests: import("@/lib/audit/evidence-types").TestExecutionRecord[];
    redirects: { from: string; to: string; status: number }[];
    userAgentDesktop: string;
    userAgentMobile: string;
  };
}
```

- [ ] **Step 2: Rewrite `scanHomepage()`'s body to assemble `evidenceParts`**

Rewrite `scanHomepage()` end-to-end (all prior tasks' pieces already exist as local functions in this file — this step wires them together):

```ts
export async function scanHomepage(inputUrl: string): Promise<BrowserScanResult> {
  const url = await assertSafeUrl(inputUrl);
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const tests: import("@/lib/audit/evidence-types").TestExecutionRecord[] = [];
  const desktopUserAgent = "LensiqBot/0.1 (+https://lensiq.site/bot)";
  const mobileUserAgent = "LensiqBot/0.1 mobile (+https://lensiq.site/bot)";
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, userAgent: desktopUserAgent });
    await secureContext(desktop);
    const desktopPage = await desktop.newPage();
    const desktopConsoleCapture = attachConsoleNetworkCapture(desktopPage);
    let desktopResponse: import("playwright").Response | null = null;
    try {
      desktopResponse = await settle(desktopPage, url);
      tests.push({ id: "desktop-dom", status: "passed" });
    } catch (error) {
      tests.push({ id: "desktop-dom", status: "failed", reason: error instanceof Error ? error.message : "Navigation failed" });
      throw error;
    }
    await assertSafeUrl(desktopPage.url());
    const cookieDesktop = await detectAndDismissCookieBanner(desktopPage);
    tests.push({ id: "cookie-banner-desktop", status: "passed" });
    const pageData = await extract(desktopPage);
    pageData.cookieBanner = deriveLegacyCookieBanner(cookieDesktop.evidence);
    const desktopEvidenceBrowser = await extractEvidence(desktopPage, "desktop");
    desktopEvidenceBrowser.cookieBanner = cookieDesktop.evidence;

    let ctaResults: { evidence: import("@/lib/audit/evidence-types").CtaJourneyEvidence; screenshot?: Buffer }[] = [];
    try {
      ctaResults = await testCtaJourneysEvidence(desktop, pageData.url, pageData.ctas);
      tests.push({ id: "cta-journey-desktop", status: "passed" });
    } catch (error) {
      tests.push({ id: "cta-journey-desktop", status: "failed", reason: error instanceof Error ? error.message : "CTA journey testing failed" });
    }
    tests.push({ id: "cta-journey-mobile", status: "skipped", reason: "single-page audit tests conversion paths once, on desktop, to bound audit runtime" });
    pageData.ctaJourneys = deriveLegacyCtaJourneys(ctaResults.map((r) => r.evidence));
    const ctaScreenshots = ctaResults
      .map((result, index) => ({ index, buffer: result.screenshot }))
      .filter((entry): entry is { index: number; buffer: Buffer } => Boolean(entry.buffer));

    let seoEvidence: import("@/lib/audit/evidence-types").SeoEvidence;
    try {
      seoEvidence = await extractSeoEvidence(desktopPage, desktopResponse);
      tests.push({ id: "seo-extraction", status: "passed" });
    } catch (error) {
      tests.push({ id: "seo-extraction", status: "failed", reason: error instanceof Error ? error.message : "SEO extraction failed" });
      throw error;
    }

    const desktopConsoleNetwork = desktopConsoleCapture();
    tests.push({ id: "console-network-desktop", status: "passed" });

    await addAnnotations(desktopPage, pageData.ctas);
    const desktopScreenshot = await desktopPage.screenshot({ fullPage: true, type: "jpeg", quality: 78 });
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: mobileUserAgent });
    await secureContext(mobile);
    const mobilePage = await mobile.newPage();
    const mobileConsoleCapture = attachConsoleNetworkCapture(mobilePage);
    try {
      await settle(mobilePage, pageData.url);
      tests.push({ id: "mobile-dom", status: "passed" });
    } catch (error) {
      tests.push({ id: "mobile-dom", status: "failed", reason: error instanceof Error ? error.message : "Navigation failed" });
      throw error;
    }
    await assertSafeUrl(mobilePage.url());
    const cookieMobile = await detectAndDismissCookieBanner(mobilePage);
    tests.push({ id: "cookie-banner-mobile", status: "passed" });
    const mobileEvidenceBrowser = await extractEvidence(mobilePage, "mobile");
    mobileEvidenceBrowser.cookieBanner = cookieMobile.evidence;
    const mobileConsoleNetwork = mobileConsoleCapture();
    tests.push({ id: "console-network-mobile", status: "passed" });
    await addAnnotations(mobilePage, pageData.ctas);
    const mobileScreenshot = await mobilePage.screenshot({ fullPage: true, type: "jpeg", quality: 75 });
    await mobile.close();

    return {
      page: pageData,
      desktopScreenshot: Buffer.from(desktopScreenshot),
      mobileScreenshot: Buffer.from(mobileScreenshot),
      ctaScreenshots,
      cookieBannerScreenshots: {
        desktop: { before: cookieDesktop.beforeScreenshot, after: cookieDesktop.afterScreenshot },
        mobile: { before: cookieMobile.beforeScreenshot, after: cookieMobile.afterScreenshot },
      },
      evidenceParts: {
        seo: seoEvidence,
        desktop: { browser: desktopEvidenceBrowser, console: desktopConsoleNetwork, ctaJourneys: ctaResults.map((r) => r.evidence) },
        mobile: { browser: mobileEvidenceBrowser, console: mobileConsoleNetwork },
        tests,
        redirects: seoEvidence.pageStatus.redirectChain,
        userAgentDesktop: desktopUserAgent,
        userAgentMobile: mobileUserAgent,
      },
    };
  } finally {
    await browser.close();
  }
}
```

Add the missing imports at the top of `browser-scanner.ts`: `import { deriveLegacyCookieBanner, deriveLegacyCtaJourneys } from "@/lib/audit/evidence-legacy";` (if not already added in Tasks 6/7).

- [ ] **Step 3: Rewrite `process-audit.ts` to assemble, sanitize, validate, and persist `AuditEvidenceV2`**

```ts
import { claimNextAudit, completeAudit, failAudit, saveScan } from "@/lib/db/audits";
import { scanHomepage } from "@/lib/audit/browser-scanner";
import { runLighthouse, buildAutomatedAccessibilityChecks } from "@/lib/audit/lighthouse-scanner";
import { generateReport } from "@/lib/audit/generate-report";
import { uploadCtaScreenshots, uploadCookieBannerScreenshots, uploadScreenshots } from "@/lib/storage/screenshots";
import { AuditEvidenceV2Schema } from "@/lib/audit/evidence-schema";
import { sanitizeText } from "@/lib/audit/evidence-sanitize";
import type { AuditEvidenceV2, TestExecutionRecord } from "@/lib/audit/evidence-types";

export async function processNextAudit() {
  const audit = await claimNextAudit();
  if (!audit) return null;
  const startedAt = new Date().toISOString();
  try {
    const browserResult = await scanHomepage(audit.normalizedUrl);
    const { metrics, evidence: performanceEvidence } = await runLighthouse(browserResult.page.url);
    const screenshots = await uploadScreenshots(audit.id, browserResult.desktopScreenshot, browserResult.mobileScreenshot);
    browserResult.page.desktopScreenshotPath = screenshots.desktop;
    browserResult.page.mobileScreenshotPath = screenshots.mobile;
    const ctaScreenshots = await uploadCtaScreenshots(audit.id, browserResult.ctaScreenshots);
    for (const { index, path } of ctaScreenshots) browserResult.page.ctaJourneys[index].screenshotPath = path;
    for (const { index, path } of ctaScreenshots) browserResult.evidenceParts.desktop.ctaJourneys[index].screenshotRef = path;

    const tests: TestExecutionRecord[] = [...browserResult.evidenceParts.tests, { id: "lighthouse-lab", status: "passed" }];
    const cookieUpload = await uploadCookieBannerScreenshots(audit.id, browserResult.cookieBannerScreenshots);
    if (cookieUpload.uploadFailed) {
      tests.push({ id: "cookie-banner-screenshot-upload", status: "failed", reason: sanitizeText("One or more cookie banner screenshots failed to upload", 300) });
    } else {
      tests.push({ id: "cookie-banner-screenshot-upload", status: "passed" });
    }
    browserResult.evidenceParts.desktop.browser.cookieBanner.screenshotBeforeDismiss = cookieUpload.desktop.before;
    browserResult.evidenceParts.desktop.browser.cookieBanner.screenshotAfterDismiss = cookieUpload.desktop.after;
    browserResult.evidenceParts.mobile.browser.cookieBanner.screenshotBeforeDismiss = cookieUpload.mobile.before;
    browserResult.evidenceParts.mobile.browser.cookieBanner.screenshotAfterDismiss = cookieUpload.mobile.after;

    const lhr = metrics.raw as import("lighthouse").Result;
    const evidence: AuditEvidenceV2 = {
      contractVersion: 2,
      methodology: {
        contractVersion: 2,
        startedAt,
        finishedAt: new Date().toISOString(),
        requestedUrl: audit.url,
        finalUrl: browserResult.page.url,
        pageGoal: audit.pageGoal,
        scope: "single-page",
        viewports: { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } },
        userAgent: { desktop: browserResult.evidenceParts.userAgentDesktop, mobile: browserResult.evidenceParts.userAgentMobile },
        tool: { lighthouseVersion: lhr.lighthouseVersion },
        redirects: browserResult.evidenceParts.redirects,
        tests,
        limitations: ["single page only, not a site-wide crawl", "field performance data not assessed — no CrUX integration this release"],
      },
      seo: browserResult.evidenceParts.seo,
      desktop: { browser: browserResult.evidenceParts.desktop.browser, console: browserResult.evidenceParts.desktop.console, ctaJourneys: browserResult.evidenceParts.desktop.ctaJourneys },
      mobile: { browser: browserResult.evidenceParts.mobile.browser, console: browserResult.evidenceParts.mobile.console, ctaJourneys: null },
      performance: performanceEvidence,
      accessibility: {
        standard: "WCAG 2.2",
        automatedChecks: buildAutomatedAccessibilityChecks(lhr),
        browserObservations: {
          imagesWithoutAlt: browserResult.evidenceParts.desktop.browser.images.filter((img) => !img.hasAlt).length,
          formInputsWithoutLabel: browserResult.evidenceParts.desktop.browser.forms.flatMap((f) => f.inputs).filter((i) => !i.hasLabel).length,
          landmarksPresent: Object.entries(browserResult.evidenceParts.desktop.browser.landmarks).filter(([, present]) => present).map(([key]) => key),
        },
        requiresHumanVerification: ["keyboard trap testing", "screen reader announcement correctness", "meaningful reading order", "color contrast on non-text UI", "focus order and visibility"],
      },
    };

    browserResult.page.evidence = AuditEvidenceV2Schema.parse(evidence);
    await saveScan(audit.id, browserResult.page, metrics, screenshots);
    const report = await generateReport(browserResult.page, metrics, audit.pageGoal);
    await completeAudit(audit.id, report);
    return { id: audit.id, status: "completed" as const };
  } catch (error) {
    await failAudit(audit.id, error);
    return { id: audit.id, status: "failed" as const, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
```

Note: `AuditEvidenceV2Schema.parse(evidence)` throwing (malformed evidence) is caught by the existing outer `try/catch`, which already calls `failAudit` — exactly the "audit fails loudly rather than persisting invalid evidence" requirement, with no new error-handling branch needed.

- [ ] **Step 4: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts src/lib/audit/process-audit.ts`
Expected: no errors. This step will likely surface several small mismatches between this task's assumptions and the exact prior tasks' code (e.g., exact variable names) — reconcile them against what Tasks 5-12 actually left in the file, not this step's prose.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit/browser-scanner.ts src/lib/audit/process-audit.ts src/lib/storage/screenshots.ts
git commit -m "feat: assemble and persist AuditEvidenceV2 through the worker pipeline"
```

---

### Task 14: Read-path validation and sanitized logging in `db/audits.ts`

**Files:**
- Modify: `src/lib/db/audits.ts`

**Interfaces:**
- Consumes: `AuditEvidenceV2Schema` (Task 3).
- Produces: `getAudit()` and `getOwnedAuditFull()` populate `page.evidence` only from a `safeParse()` success; otherwise `undefined` plus a sanitized log line.

- [ ] **Step 1: Add a shared helper**

Add near the top of `db/audits.ts`:

```ts
import { AuditEvidenceV2Schema } from "@/lib/audit/evidence-schema";

function parseEvidence(auditId: string, raw: unknown): import("@/lib/audit/evidence-types").AuditEvidenceV2 | undefined {
  if (raw === undefined || raw === null) return undefined;
  const result = AuditEvidenceV2Schema.safeParse(raw);
  if (result.success) return result.data;
  console.error(`[audits] evidence failed validation for ${auditId}, treating as absent`, { issueCount: result.error.issues.length, paths: result.error.issues.map((issue) => issue.path.join(".")).slice(0, 10) });
  return undefined;
}
```

- [ ] **Step 2: Wire it into `getAudit()` and `getOwnedAuditFull()`**

In both functions, where `result.page` is built from `page.extracted_json as ExtractedPage`, add one line right after the cast to attach the validated (or cleared) evidence:

```ts
if (page) {
  result.page = { ...(page.extracted_json as ExtractedPage), desktopScreenshotPath: page.desktop_screenshot_url, mobileScreenshotPath: page.mobile_screenshot_url };
  result.page.evidence = parseEvidence(id, (page.extracted_json as { evidence?: unknown })?.evidence);
}
```

(This replaces the existing two lines that set `result.page = {...}` in both `getAudit` (around line 33) and `getOwnedAuditFull` (around line 73) — same structure, one added line each.)

- [ ] **Step 3: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/db/audits.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/audits.ts
git commit -m "feat: safe-parse evidence on read, degrade invalid/legacy rows to undefined"
```

---

### Task 15: Report-copy corrections

**Files:**
- Modify: `src/components/report/report-view.tsx`

**Interfaces:**
- Consumes: `AuditRecord.page.evidence` (optional).

- [ ] **Step 1: CTA copy gating in `buildWalkthrough()`**

Replace:

```ts
function buildWalkthrough(page: ExtractedPage): string[] {
  const heading = page.headings.find((h) => h.level === 1)?.text || page.title;
  const steps: string[] = [`I land on the page and the first thing I read is “${heading}.”`];
  const foldText = page.aboveFold.text.trim();
  if (foldText) steps.push(`Just below it: “${foldText.slice(0, 150)}${foldText.length > 150 ? "…" : ""}”`);
  if (page.cookieBanner.detected) steps.push("Before I can read further, a cookie consent banner asks me to decide.");
  for (const journey of page.ctaJourneys.slice(0, 3)) {
    steps.push(journey.sameOrigin ? `I click “${journey.text}” — ${journey.outcome.toLowerCase()}.` : `I click “${journey.text}” — it sends me to an external site.`);
  }
  return steps;
}
```

with:

```ts
function buildWalkthrough(page: ExtractedPage): string[] {
  const heading = page.headings.find((h) => h.level === 1)?.text || page.title;
  const steps: string[] = [`I land on the page and the first thing I read is “${heading}.”`];
  const foldText = page.aboveFold.text.trim();
  if (foldText) steps.push(`Just below it: “${foldText.slice(0, 150)}${foldText.length > 150 ? "…" : ""}”`);
  if (page.cookieBanner.detected) steps.push("Before I can read further, a cookie consent banner asks me to decide.");

  const evidenceJourneys = page.evidence?.desktop.ctaJourneys;
  if (evidenceJourneys) {
    for (const journey of evidenceJourneys.slice(0, 3)) {
      if (journey.navigationAttempted && (journey.outcome === "navigated" || journey.outcome === "redirected")) {
        steps.push(`I click “${journey.text}” — it ${journey.outcome === "redirected" ? "redirects and loads" : "loads"}.`);
      } else if (journey.outcome === "external-not-visited") {
        steps.push(`I see “${journey.text}” — it points to an external site, not visited in this audit.`);
      } else {
        steps.push(`I see “${journey.text}” — not tested in this audit.`);
      }
    }
  } else {
    for (const journey of page.ctaJourneys.slice(0, 3)) {
      steps.push(journey.sameOrigin ? `I click “${journey.text}” — ${journey.outcome.toLowerCase()}.` : `I click “${journey.text}” — it sends me to an external site.`);
    }
  }
  return steps;
}
```

- [ ] **Step 2: Responsiveness metric label split**

Replace the technical-snapshot metrics row:

```tsx
<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["LCP", metric(metrics.lcp, "ms")], ["CLS", metric(metrics.cls)], ["TBT / INP", metric(metrics.inpOrTbt, "ms")], ["TTFB", metric(metrics.ttfb, "ms")]].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b py-5"><span className="text-xs text-muted-foreground">{label}</span><strong className="font-mono">{value}</strong></div>)}</div>
```

with:

```tsx
<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
  ["LCP", metric(metrics.lcp, "ms")],
  ["CLS", metric(metrics.cls)],
  ...(audit.page?.evidence
    ? [["TBT (lab proxy)", metric(audit.page.evidence.performance.lab.tbt, "ms")], ["INP (field)", audit.page.evidence.performance.field.status === "not-assessed" ? "Not assessed" : metric(audit.page.evidence.performance.field.inp, "ms")]]
    : [["Legacy responsiveness metric — source not recorded", metric(metrics.inpOrTbt, "ms")]]),
  ["TTFB", metric(metrics.ttfb, "ms")],
].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b py-5"><span className="text-xs text-muted-foreground">{label}</span><strong className="font-mono">{value}</strong></div>)}</div>
```

- [ ] **Step 3: Typecheck and lint**

Run: `docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/components/report/report-view.tsx`
Expected: no errors. `demoAudit` (no `evidence` field) must still render via the `else`/legacy-label branches in both changes — confirmed structurally by the optional-chaining/ternary logic above, verified live in Task 16.

- [ ] **Step 4: Commit**

```bash
git add src/components/report/report-view.tsx
git commit -m "fix: gate CTA copy on real navigation, split TBT/INP responsiveness label"
```

---

### Task 16: Live verification against a controlled fixture

**Files:** none (verification only — no code changes unless a defect is found, in which case stop and fix per the standing "if a security-relevant test fails, stop and document before cleaning up" rule).

- [ ] **Step 1: Full local build gate**

```bash
docker-compose run --rm web npx tsc --noEmit
docker-compose run --rm web npx eslint .
docker-compose run --rm web npm run build
```
Expected: all three pass clean. If `next build` regenerates `next-env.d.ts`, revert it (`git checkout -- next-env.d.ts`) as in prior sprints — it's an auto-generated artifact, not a real change.

- [ ] **Step 2: Deploy the temporary fixture**

Create a minimal standalone static HTML page containing every element the spec's Testing plan requires (different desktop/mobile CSS, a real cookie banner with a dismiss button, one same-origin CTA that 302-redirects once, one external CTA, one CTA (or the page's own load) that redirects to a private/link-local address, valid + one malformed JSON-LD block, canonical/robots/hreflang tags, a deliberate `console.error(...)`, an `<img>` pointing at a guaranteed-404 path, one labeled form and one unlabeled form). Add `<meta name="robots" content="noindex, nofollow">`. Deploy it as its own throwaway Vercel project (`vercel deploy` from a scratch directory, not linked to the Lensiq project) so the temporary URL and any cleanup are fully isolated from production. Record the URL only in a local temp file (e.g. `/private/tmp/.../fixture-url.txt`), never in a committed file.

- [ ] **Step 3: Run a real audit through the actual worker pipeline**

Using the live Docker dev stack (`docker-compose up -d web worker`), create a real audit against the fixture URL through the legitimate app path (`POST /api/audits` with a real authenticated session, or `createAudit()` directly if that's the established pattern from the prior sprint — match whatever the ACL sprint's Task 9 protocol used, since it's already proven safe), mark it paid via `markAuditPaid()` if needed to let the worker pick it up, and let `processNextAudit()` run to completion.

- [ ] **Step 4: Verify every final criterion from the design spec**

Query the completed audit (via the app's own `getOwnedAuditFull`/`getAudit`, not raw SQL) and confirm:
- `page.evidence.desktop` and `page.evidence.mobile` browser evidence differ in a way that proves independent extraction (not identical objects).
- `cookieBanner.detected`/`.dismissed` are both `true` (fixture has a real, dismissible banner) and `blockingStatus` is `"verified"` with a boolean `blocking` value, not `null`, since the check ran.
- The redirecting same-origin CTA has `outcome: "redirected"`, `redirectCount >= 1`.
- The external CTA has `outcome: "external-not-visited"`, `navigationAttempted: false`.
- The private-address redirect case shows the corresponding request blocked (either the whole CTA journey/page load fails with a network error attributable to `assertSafeUrl`, or the worker itself throws — confirm via worker logs, not by guessing) — **this is the one check where, per the standing rule, if it does NOT show the block, stop and document before touching anything else; do not clean up the fixture or the audit row until this is resolved.**
- `seo.jsonLd` has one entry with `parsed: true` and one with `parsed: false, parseError` set; no entry contains the raw script text, only `excerptHash`/`sanitizedExcerpt`.
- `performance.lab.tbt` is a number, `performance.field.status === "not-assessed"`, `performance.field.inp === null`.
- `accessibility.requiresHumanVerification` is present and non-empty; nothing in the persisted data or a rendered report page claims "WCAG compliant" or an automatic conformance level.
- `AuditEvidenceV2Schema.parse()` succeeded (implied by the row existing with `status: "completed"` and no validation-driven `failAudit`) — additionally confirm `safeParse()` degrades gracefully by round-tripping a deliberately corrupted copy of the same JSON through `AuditEvidenceV2Schema.safeParse()` in a throwaway script (not against the live row).

- [ ] **Step 5: Regression-check `/audits/demo` and legacy behavior**

Via a real browser (Playwright), visit `/audits/demo` and confirm it renders exactly as before (single legacy responsiveness label, existing cookie-banner/CTA copy) — `demoAudit` has no `evidence` field, so this also exercises the `else` branches added in Task 15.

- [ ] **Step 6: Cleanup**

In this order: delete the fixture audit row (via the app's legitimate delete path if one exists, or note if none exists and it must simply be left as a clearly-labeled test row — do not invent a raw-SQL delete), tear down the throwaway Vercel deployment (`vercel remove` on that scratch project), delete the local temp file tracking the fixture URL, confirm `git status` shows a clean working tree with no stray screenshots/logs, and confirm no credential, token, or the fixture URL itself was committed anywhere.

- [ ] **Step 7: Final commit (if any cleanup touched tracked files)**

Only if Step 6 modified any tracked file (it shouldn't, since the fixture lives outside this repo) — otherwise this step is a no-op and the branch is ready for the closeout/PR conversation.

---

## Self-review notes

- **Spec coverage:** every named correction from the second design-review round (null-not-false pairs, geometric candidates vs. findings, Zod validation, centralized sanitization, future-compatible field-performance shape, cookie-screenshot lifecycle, single-source-of-truth derivation, corrected fixture strategy, typed test execution, accessibility boundary language) has a task above. The three report-copy corrections (Task 15) and the preflight confirmation (already recorded in the spec, not a code task) are both covered.
- **Placeholder scan:** no task above says "add appropriate error handling" or defers real code to a later step without showing it.
- **Type consistency:** `AuditEvidenceV2`/`BrowserEvidence`/`CtaJourneyEvidence`/etc. field names are used identically across Tasks 1, 3-4, 5-13, and 15 — cross-checked against Task 1's exact interface definitions while drafting every later task.
