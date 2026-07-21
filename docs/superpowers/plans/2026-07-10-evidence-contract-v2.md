# Professional Audit Engine v2 — Evidence Contract v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned, runtime-validated, unambiguously-citable evidence layer under Lensiq's audit report. The point is not just "collect more data" — every future report conclusion must be traceable to a stable, verifiable, safely-stored piece of evidence. Zero DB migration, zero breakage of `/audits/demo` or existing completed audits, exactly three narrow report-copy corrections.

**Architecture:** An additive, optional `ExtractedPage.evidence?: AuditEvidenceV2` field. Every repeatable evidence record carries a deterministic `evidenceId` (never an array index). The whole assembled object passes through one centralized deep sanitizer, then a Zod schema whose `superRefine` rules forbid contradictory states (not just wrong shapes), before persisting through the existing `extracted_json` jsonb column. Legacy `cookieBanner`/`ctaJourneys` fields are pure derivations from the v2 evidence — one measurement, two shapes, never two measurements. A committed `node:test` suite (no new framework) covers the contract's core guarantees; a live fixture run is additional, not a substitute.

**Tech Stack:** Next.js 16 App Router / TypeScript, Playwright, Lighthouse, Zod 4, Supabase (service-role admin client only), `node:test` (built into Node, already have `tsx` as devDependency), Docker for all builds/tests via `docker-compose`.

**Execution:** Four checkpoints — **A. Foundations**, **B. Scanner**, **C. Assembly**, **D. Live fixture/verification**. Self-review after each checkpoint (spec coverage, placeholder scan, type consistency — see the writing-plans skill). Open a PR at the end; no merge.

## Global Constraints

- Never coerce an unmeasured/not-assessed fact to `false`, `0`, or an empty result — use `value | null` + its own `...Status: EvidenceStatus` sibling field.
- No generic `EvidenceItem<T>` envelope — concrete `value | null` + `...Status` sibling fields directly on each type.
- **Every repeatable evidence record carries a deterministic `evidenceId: EvidenceId`** (a stable string derived from the record's own stable content, not a counter or array index): CTA journeys, geometric/tap-target candidates, console errors, network failures, JSON-LD blocks, hreflang/OG entries, screenshot evidence, accessibility observations. Cross-references (CTA ↔ screenshot, a future `Finding.evidenceRefs: EvidenceId[]`) resolve by `evidenceId`, never by position. `Finding` itself (`src/lib/audit/types.ts`) is **not** modified this sprint — only `EvidenceId` is exported now, so a future Finding v2 can adopt `evidenceRefs` without another contract change.
- `ExtractedPage.cookieBanner`/`ExtractedPage.ctaJourneys` are computed **only** by pure derivation functions from v2 evidence — never a second independent pass.
- The Zod schema enforces **runtime invariants**, not just shapes, via `superRefine`: `blocking=null` iff `blockingStatus="not-assessed"`; `navigationAttempted=false` requires `skippedReason` and a compatible `outcome`; `external-not-visited` requires `sameOrigin=false` and `navigationAttempted=false`; `navigated`/`redirected` require `navigationAttempted=true` and `finalUrl`; `redirected` requires `redirectCount>=1`; field-performance `status="available"` requires non-null values, `"not-assessed"|"insufficient-data"` require null values; `mobile.ctaJourneys=null` requires a matching `cta-journey-mobile` skip record in `methodology.tests`; timestamps are ISO 8601; HTTP statuses are 100-599; viewport dimensions are positive; lab/field metric numbers are non-negative; `runCount>=1`. An evidence object failing any invariant is logged (sanitized) and degrades to `undefined`, never persisted as if valid.
- **One centralized `sanitizeEvidenceV2(evidence)` runs on the whole assembled object immediately before `AuditEvidenceV2Schema.parse()` and persistence** — covering URLs/query strings, selectors, CTA text, form `action`/input `name`, OG metadata, JSON-LD excerpts, console/network messages, error messages, and methodology notes/reasons. Per-field `sanitizeUrl`/`sanitizeText` calls at the point of capture remain as defense-in-depth, not as the only line of defense.
- JSON-LD: hash and excerpt are derived from **redacted** content, never the raw script text directly — the full script is never stored under any circumstance.
- `AuditEvidenceV2Schema.parse()` before persistence (throw → `failAudit`, no silent partial write); `safeParse()` on every read (failure or absence → `page.evidence = undefined` + a sanitized log line, never a throw up through a route).
- No new Supabase migration — evidence rides the existing `audit_pages.extracted_json` jsonb column.
- **`raw_lighthouse_json` (`audit_metrics.raw_lighthouse_json`) is no longer persisted in full** — it is confirmed unused by any reader (grepped repo-wide) and can carry unsanitized URLs/query strings from the Lighthouse run. Replace it with a small, explicitly sanitized diagnostic subset (or `null`), never the entire `lhr` object.
- Cookie-banner screenshots: captured **only when a banner is actually detected**; size/resolution-capped; `Buffer`s are cleared from in-memory structures immediately after a successful upload; `screenshotBeforeDismiss`/`.After` are set only post-upload; a partial-upload failure keeps whichever refs succeeded and records precisely which viewport/stage failed (never a blanket boolean).
- A CTA redirecting to a private/unsafe address is **not** a generic `network-error` — it is the typed `blocked-unsafe-redirect` outcome, must not fail the whole audit, and must never persist the actual private address (a fixed generic message only).
- `AuditTestId` is a closed union; no free-text test names.
- Every redirect hop — page-level and CTA-level — is re-validated with `assertSafeUrl`/`resolveSafeHostAddress`.
- No raw SQL at any point, no exception this sprint.
- Checkpoint D's fixture is a fully isolated, temporary Vercel project (its own real routes/functions producing genuine 302s, not static HTML) — no production env, no secrets, no custom domain, no Git linkage. Torn down completely afterward: project, temp files, audit + its child rows, **and every uploaded Storage object**.
- Lighthouse `testConditions` (`throttlingMethod`, `cpuThrottling`, `networkProfile`, `locale`, `formFactor`) are read from the actual `lhr.configSettings` at runtime, never hardcoded.
- `demoAudit`/`/audits/demo` render unchanged. Every new field is optional.
- Scope unchanged: no new scoring, no expert-prompt changes, no report redesign beyond the three approved copy corrections, no pricing/Stripe/landing changes, no CrUX integration, no RLS/browser-side Supabase client, no benchmark/competitor references.

---

## Checkpoint A — Foundations

### Task A1: Evidence types, `EvidenceId`, stable-ID generation

**Files:**
- Create: `src/lib/audit/evidence-types.ts`
- Create: `src/lib/audit/evidence-id.ts`
- Modify: `src/lib/audit/types.ts` (add optional `evidence` field to `ExtractedPage`)

- [ ] **Step 1: Evidence types**

```ts
// src/lib/audit/evidence-types.ts
export type EvidenceStatus = "verified" | "inferred" | "not-assessed";
export type EvidenceId = string;

export type AuditTestId =
  | "desktop-dom" | "mobile-dom"
  | "cta-journey-desktop" | "cta-journey-mobile"
  | "cookie-banner-desktop" | "cookie-banner-mobile"
  | "cookie-banner-screenshot-upload"
  | "seo-extraction"
  | "console-network-desktop" | "console-network-mobile"
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

export interface BoundingBox { x: number; y: number; width: number; height: number; }

// Geometric measurement is "verified"; whether it represents a real problem is always
// "inferred" — an overlay can be intentional, a small target can satisfy a WCAG 2.5.8
// exception. `status` here is deliberately always "inferred" for a populated candidate.
export interface OverlapCandidate {
  evidenceId: EvidenceId;
  selector: string;
  overlapsWithSelector: string;
  issue: "cutoff" | "overlap";
  boundingBox: BoundingBox;
  status: EvidenceStatus;
}

export interface SmallTapTargetCandidate {
  evidenceId: EvidenceId;
  selector: string;
  boundingBox: BoundingBox;
  widthPx: number;
  heightPx: number;
  status: EvidenceStatus;
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

export type CtaOutcome = "navigated" | "redirected" | "http-error" | "network-error" | "blocked-unsafe-redirect" | "external-not-visited" | "skipped-limit" | "skipped-invalid-url";

export interface CtaJourneyEvidence {
  evidenceId: EvidenceId;
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

export interface ConsoleErrorEvidence { evidenceId: EvidenceId; message: string; timestamp: string; }
export interface PageErrorEvidence { evidenceId: EvidenceId; message: string; timestamp: string; }
export interface FailedRequestEvidence { evidenceId: EvidenceId; url: string; resourceType: string; domain: string; status: number | null; message?: string; }

export interface ConsoleNetworkEvidence {
  consoleErrors: ConsoleErrorEvidence[];
  pageErrors: PageErrorEvidence[];
  failedRequests: FailedRequestEvidence[];
  limits: { maxConsoleErrors: number; maxFailedRequests: number; truncated: boolean };
}

export interface ViewportEvidence {
  browser: BrowserEvidence;
  console: ConsoleNetworkEvidence;
  ctaJourneys: CtaJourneyEvidence[] | null;
}

export interface JsonLdEvidence {
  evidenceId: EvidenceId;
  parsed: boolean;
  types: string[];
  parseError?: string;
  excerptHash: string;
  sanitizedExcerpt?: string;
  contentMatch: boolean | null;
  contentMatchStatus: EvidenceStatus;
}

export interface HreflangEvidence { evidenceId: EvidenceId; lang: string; href: string; }
export interface OpenGraphEvidence { evidenceId: EvidenceId; property: string; content: string; }

export interface SeoEvidence {
  title: string;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;
  htmlLang: string | null;
  viewportMeta: string | null;
  headings: { level: number; text: string }[];
  hreflang: HreflangEvidence[];
  openGraph: OpenGraphEvidence[];
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

export interface AccessibilityObservation { evidenceId: EvidenceId; id: string; title: string; impact?: string; }

// Explicitly per-viewport — Lighthouse itself only runs once (desktop), so mobile's
// automatedChecks MUST read not-assessed, never silently inherit desktop's score.
// browserObservations, by contrast, genuinely exist for both viewports (Task B1 runs
// extractEvidence() on both), so they're populated for real on both sides.
export interface AccessibilityEvidence {
  standard: "WCAG 2.2";
  desktop: {
    automatedChecks: { source: "lighthouse"; status: "verified"; score: number; failedAudits: AccessibilityObservation[] };
    browserObservations: { imagesWithoutAlt: number; formInputsWithoutLabel: number; landmarksPresent: string[] };
  };
  mobile: {
    automatedChecks: { source: "lighthouse"; status: "not-assessed"; score: null; failedAudits: [] };
    browserObservations: { imagesWithoutAlt: number; formInputsWithoutLabel: number; landmarksPresent: string[] };
  };
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

- [ ] **Step 2: Deterministic ID generation**

```ts
// src/lib/audit/evidence-id.ts
import { hashContent } from "@/lib/audit/evidence-sanitize";
import type { EvidenceId } from "@/lib/audit/evidence-types";

// Deterministic: same category + same stable key parts always produce the same id, so
// citing "cta:9f3ab21c4e01" remains meaningful even if array order changes between runs
// or re-renders. Never derived from an array index or a random value.
export function makeEvidenceId(category: string, ...keyParts: string[]): EvidenceId {
  return `${category}:${hashContent(keyParts.join("|")).slice(0, 12)}`;
}
```

(Depends on Task A2's `hashContent` — implement this file after A2, or accept the forward reference since both land in the same checkpoint before any typecheck gate.)

- [ ] **Step 3: Add `evidence` to `ExtractedPage`**

In `src/lib/audit/types.ts`: `import type { AuditEvidenceV2 } from "@/lib/audit/evidence-types";` and add `evidence?: AuditEvidenceV2;` as the last field of `ExtractedPage`.

- [ ] **Step 4: Typecheck, commit**

```bash
docker-compose run --rm web npx tsc --noEmit
git add src/lib/audit/evidence-types.ts src/lib/audit/evidence-id.ts src/lib/audit/types.ts
git commit -m "feat: add Evidence Contract v2 types with stable evidenceId"
```

---

### Task A2: Centralized sanitization, including whole-object `sanitizeEvidenceV2`

**Files:** Create `src/lib/audit/evidence-sanitize.ts`

- [ ] **Step 1: Base redaction primitives**

```ts
// src/lib/audit/evidence-sanitize.ts
import { createHash } from "node:crypto";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const API_KEY_PATTERN = /\b(sk|pk|rk)_[A-Za-z0-9]{10,}\b|\bAIza[A-Za-z0-9_-]{20,}\b/g;
const UUID_PATTERN = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const PRIVATE_IPV4_PATTERN = /\b(?:10|127|192\.168|169\.254|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const GENERIC_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;

// Redaction only — no truncation. Used before hashing, where truncating first would
// weaken the hash's ability to distinguish genuinely different content.
export function redactSensitivePatterns(input: string): string {
  return input
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(API_KEY_PATTERN, "[redacted-api-key]")
    .replace(UUID_PATTERN, "[redacted-uuid]")
    .replace(PRIVATE_IPV4_PATTERN, "[redacted-private-address]")
    .replace(GENERIC_TOKEN_PATTERN, "[redacted-token]");
}

export function sanitizeUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return sanitizeText(raw, 300); }
  url.hash = "";
  if (url.search) url.search = "?[redacted]";
  const sanitizedPath = url.pathname.length > 200 ? `${url.pathname.slice(0, 200)}…` : url.pathname;
  return redactSensitivePatterns(`${url.origin}${sanitizedPath}${url.search}`);
}

export function sanitizeText(raw: string, maxLength: number): string {
  const redacted = redactSensitivePatterns(raw);
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
}

export function hashContent(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
```

- [ ] **Step 2: Whole-object `sanitizeEvidenceV2`**

Applied to the fully-assembled object, immediately before Zod validation — this is the deep pass; per-field sanitizer calls made during capture (Checkpoint B) remain as defense-in-depth, not the only safeguard.

```ts
import type { AuditEvidenceV2 } from "@/lib/audit/evidence-types";

const TEXT_FIELD_MAX = 2000;

export function sanitizeEvidenceV2(evidence: AuditEvidenceV2): AuditEvidenceV2 {
  const sanitizeUrlField = (u: string) => sanitizeUrl(u);
  const sanitizeTextField = (t: string, max = TEXT_FIELD_MAX) => sanitizeText(t, max);

  const sanitizeBrowser = (browser: AuditEvidenceV2["desktop"]["browser"]) => ({
    ...browser,
    ctasVisible: browser.ctasVisible.map((c) => ({ ...c, text: sanitizeTextField(c.text, 300), href: sanitizeUrlField(c.href) })),
    overlapCandidates: browser.overlapCandidates?.map((c) => ({ ...c, selector: sanitizeTextField(c.selector, 300), overlapsWithSelector: sanitizeTextField(c.overlapsWithSelector, 300) })) ?? null,
    smallTapTargetCandidates: browser.smallTapTargetCandidates?.map((c) => ({ ...c, selector: sanitizeTextField(c.selector, 300) })) ?? null,
    forms: browser.forms.map((f) => ({ action: sanitizeUrlField(f.action), inputs: f.inputs.map((i) => ({ ...i, name: sanitizeTextField(i.name, 200) })) })),
    images: browser.images.map((img) => ({ ...img, src: sanitizeUrlField(img.src) })),
  });

  const sanitizeConsole = (consoleEvidence: AuditEvidenceV2["desktop"]["console"]) => ({
    consoleErrors: consoleEvidence.consoleErrors.map((e) => ({ ...e, message: sanitizeTextField(e.message, 500) })),
    pageErrors: consoleEvidence.pageErrors.map((e) => ({ ...e, message: sanitizeTextField(e.message, 500) })),
    failedRequests: consoleEvidence.failedRequests.map((r) => ({ ...r, url: sanitizeUrlField(r.url), message: r.message ? sanitizeTextField(r.message, 300) : r.message })),
    limits: consoleEvidence.limits,
  });

  const sanitizeCta = (journeys: AuditEvidenceV2["desktop"]["ctaJourneys"]) => journeys?.map((j) => ({
    ...j,
    text: sanitizeTextField(j.text, 300),
    declaredUrl: sanitizeUrlField(j.declaredUrl),
    finalUrl: j.finalUrl ? sanitizeUrlField(j.finalUrl) : j.finalUrl,
    error: j.error ? sanitizeTextField(j.error, 300) : j.error,
    skippedReason: j.skippedReason ? sanitizeTextField(j.skippedReason, 300) : j.skippedReason,
  })) ?? null;

  return {
    ...evidence,
    methodology: {
      ...evidence.methodology,
      requestedUrl: sanitizeUrlField(evidence.methodology.requestedUrl),
      finalUrl: sanitizeUrlField(evidence.methodology.finalUrl),
      redirects: evidence.methodology.redirects.map((r) => ({ from: sanitizeUrlField(r.from), to: sanitizeUrlField(r.to), status: r.status })),
      tests: evidence.methodology.tests.map((t) => (t.reason ? { ...t, reason: sanitizeTextField(t.reason, 500) } : t)),
      limitations: evidence.methodology.limitations.map((l) => sanitizeTextField(l, 300)),
    },
    seo: {
      ...evidence.seo,
      canonical: evidence.seo.canonical ? sanitizeUrlField(evidence.seo.canonical) : evidence.seo.canonical,
      hreflang: evidence.seo.hreflang.map((h) => ({ ...h, href: sanitizeUrlField(h.href) })),
      openGraph: evidence.seo.openGraph.map((og) => ({ ...og, content: sanitizeTextField(og.content, 1000) })),
      jsonLd: evidence.seo.jsonLd.map((j) => (j.sanitizedExcerpt ? { ...j, sanitizedExcerpt: sanitizeTextField(j.sanitizedExcerpt, 400) } : j)),
      links: evidence.seo.links.map((l) => ({ ...l, href: sanitizeUrlField(l.href) })),
      pageStatus: { ...evidence.seo.pageStatus, redirectChain: evidence.seo.pageStatus.redirectChain.map((r) => ({ from: sanitizeUrlField(r.from), to: sanitizeUrlField(r.to), status: r.status })) },
    },
    desktop: { browser: sanitizeBrowser(evidence.desktop.browser), console: sanitizeConsole(evidence.desktop.console), ctaJourneys: sanitizeCta(evidence.desktop.ctaJourneys) },
    mobile: { browser: sanitizeBrowser(evidence.mobile.browser), console: sanitizeConsole(evidence.mobile.console), ctaJourneys: sanitizeCta(evidence.mobile.ctaJourneys) },
  };
}
```

- [ ] **Step 3: Typecheck, lint, commit**

```bash
docker-compose run --rm web npx tsc --noEmit
docker-compose run --rm web npx eslint src/lib/audit/evidence-sanitize.ts
git add src/lib/audit/evidence-sanitize.ts
git commit -m "feat: add centralized sanitizer with whole-object sanitizeEvidenceV2"
```

---

### Task A3: Zod schema with runtime invariants

**Files:** Create `src/lib/audit/evidence-schema.ts`

- [ ] **Step 1: Field-level schema (shapes + numeric/format bounds)**

```ts
// src/lib/audit/evidence-schema.ts
import { z } from "zod";

const evidenceStatus = z.enum(["verified", "inferred", "not-assessed"]);
const evidenceId = z.string().min(1).max(200);
const isoTimestamp = z.iso.datetime();
const httpStatus = z.number().int().min(100).max(599);
const boundingBox = z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() });

const testExecutionRecord = z.object({
  id: z.enum(["desktop-dom", "mobile-dom", "cta-journey-desktop", "cta-journey-mobile", "cookie-banner-desktop", "cookie-banner-mobile", "cookie-banner-screenshot-upload", "seo-extraction", "console-network-desktop", "console-network-mobile", "lighthouse-lab"]),
  status: z.enum(["passed", "failed", "skipped"]),
  reason: z.string().max(500).optional(),
}).superRefine((val, ctx) => {
  if (val.status !== "passed" && !val.reason) ctx.addIssue({ code: "custom", message: `reason required when status is ${val.status}` });
});

const methodologyBase = z.object({
  contractVersion: z.literal(2),
  startedAt: isoTimestamp,
  finishedAt: isoTimestamp,
  requestedUrl: z.string().max(2000),
  finalUrl: z.string().max(2000),
  pageGoal: z.string().max(500),
  scope: z.literal("single-page"),
  viewports: z.object({ desktop: z.object({ width: z.number().positive(), height: z.number().positive() }), mobile: z.object({ width: z.number().positive(), height: z.number().positive() }) }),
  userAgent: z.object({ desktop: z.string().max(300), mobile: z.string().max(300) }),
  tool: z.object({ lighthouseVersion: z.string().max(50) }),
  redirects: z.array(z.object({ from: z.string().max(2000), to: z.string().max(2000), status: httpStatus })).max(20),
  tests: z.array(testExecutionRecord).max(20),
  limitations: z.array(z.string().max(300)).max(20),
});

const overlapCandidate = z.object({ evidenceId, selector: z.string().max(300), overlapsWithSelector: z.string().max(300), issue: z.enum(["cutoff", "overlap"]), boundingBox, status: evidenceStatus });
const smallTapTargetCandidate = z.object({ evidenceId, selector: z.string().max(300), boundingBox, widthPx: z.number().nonnegative(), heightPx: z.number().nonnegative(), status: evidenceStatus });

const cookieBannerEvidence = z.object({
  detected: z.boolean(),
  dismissAttempted: z.boolean(),
  dismissed: z.boolean(),
  blocking: z.boolean().nullable(),
  blockingStatus: evidenceStatus,
  buttonsFound: z.array(z.string().max(200)).max(10),
  screenshotBeforeDismiss: z.string().max(500).optional(),
  screenshotAfterDismiss: z.string().max(500).optional(),
}).superRefine((val, ctx) => {
  if (val.blockingStatus === "not-assessed" && val.blocking !== null) ctx.addIssue({ code: "custom", message: "blocking must be null when blockingStatus is not-assessed" });
  if (val.blockingStatus !== "not-assessed" && val.blocking === null) ctx.addIssue({ code: "custom", message: "blocking must not be null when blockingStatus is not not-assessed" });
  if (!val.detected && (val.dismissAttempted || val.dismissed)) ctx.addIssue({ code: "custom", message: "dismissAttempted/dismissed require detected" });
});

const ctaOutcome = z.enum(["navigated", "redirected", "http-error", "network-error", "blocked-unsafe-redirect", "external-not-visited", "skipped-limit", "skipped-invalid-url"]);

const ctaJourneyEvidence = z.object({
  evidenceId,
  text: z.string().max(300),
  element: z.string().max(50),
  declaredUrl: z.string().max(2000),
  sameOrigin: z.boolean(),
  navigationAttempted: z.boolean(),
  finalUrl: z.string().max(2000).optional(),
  redirectCount: z.number().int().nonnegative().optional(),
  httpStatus: httpStatus.optional(),
  outcome: ctaOutcome,
  screenshotRef: z.string().max(500).optional(),
  error: z.string().max(500).optional(),
  skippedReason: z.string().max(500).optional(),
}).superRefine((val, ctx) => {
  const requireSkipped = () => { if (!val.skippedReason) ctx.addIssue({ code: "custom", message: `skippedReason required for outcome ${val.outcome}` }); };
  switch (val.outcome) {
    case "external-not-visited":
      if (val.sameOrigin) ctx.addIssue({ code: "custom", message: "external-not-visited requires sameOrigin=false" });
      if (val.navigationAttempted) ctx.addIssue({ code: "custom", message: "external-not-visited requires navigationAttempted=false" });
      requireSkipped();
      break;
    case "skipped-limit":
    case "skipped-invalid-url":
      if (val.navigationAttempted) ctx.addIssue({ code: "custom", message: `${val.outcome} requires navigationAttempted=false` });
      requireSkipped();
      break;
    case "navigated":
    case "redirected":
      if (!val.navigationAttempted) ctx.addIssue({ code: "custom", message: `${val.outcome} requires navigationAttempted=true` });
      if (!val.finalUrl) ctx.addIssue({ code: "custom", message: `${val.outcome} requires finalUrl` });
      if (val.outcome === "redirected" && !(val.redirectCount && val.redirectCount >= 1)) ctx.addIssue({ code: "custom", message: "redirected requires redirectCount >= 1" });
      break;
    case "http-error":
      if (!val.navigationAttempted) ctx.addIssue({ code: "custom", message: "http-error requires navigationAttempted=true" });
      if (val.httpStatus === undefined) ctx.addIssue({ code: "custom", message: "http-error requires httpStatus" });
      break;
    case "network-error":
    case "blocked-unsafe-redirect":
      if (!val.navigationAttempted) ctx.addIssue({ code: "custom", message: `${val.outcome} requires navigationAttempted=true` });
      if (!val.error) ctx.addIssue({ code: "custom", message: `${val.outcome} requires error` });
      break;
  }
});

const browserEvidence = z.object({
  viewport: z.enum(["desktop", "mobile"]),
  headline: z.string().max(500).nullable(),
  headingHierarchy: z.array(z.object({ level: z.number().int().min(1).max(6), text: z.string().max(500) })).max(80),
  aboveFold: z.object({ text: z.string().max(5000), ctaTexts: z.array(z.string().max(300)).max(50), imageCount: z.number().nonnegative() }),
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
  consoleErrors: z.array(z.object({ evidenceId, message: z.string().max(500), timestamp: isoTimestamp })).max(20),
  pageErrors: z.array(z.object({ evidenceId, message: z.string().max(500), timestamp: isoTimestamp })).max(20),
  failedRequests: z.array(z.object({ evidenceId, url: z.string().max(500), resourceType: z.string().max(50), domain: z.string().max(300), status: httpStatus.nullable(), message: z.string().max(500).optional() })).max(20),
  limits: z.object({ maxConsoleErrors: z.number().int().positive(), maxFailedRequests: z.number().int().positive(), truncated: z.boolean() }),
});

// Capped at 50, matching ExtractedPage.ctas' own extraction cap — this records every
// candidate (tested + skipped-limit + skipped-invalid-url), not only the 5 actually
// navigated, so it is deliberately larger than the "5 tested" navigation cap.
const viewportEvidence = z.object({ browser: browserEvidence, console: consoleNetworkEvidence, ctaJourneys: z.array(ctaJourneyEvidence).max(50).nullable() });

const jsonLdEvidence = z.object({
  evidenceId,
  parsed: z.boolean(),
  types: z.array(z.string().max(100)).max(20),
  parseError: z.string().max(300).optional(),
  excerptHash: z.string().length(64),
  sanitizedExcerpt: z.string().max(500).optional(),
  contentMatch: z.boolean().nullable(),
  contentMatchStatus: evidenceStatus,
}).superRefine((val, ctx) => {
  if (val.contentMatchStatus === "not-assessed" && val.contentMatch !== null) ctx.addIssue({ code: "custom", message: "contentMatch must be null when not-assessed" });
});

const seoEvidence = z.object({
  title: z.string().max(500),
  metaDescription: z.string().max(1000).nullable(),
  canonical: z.string().max(2000).nullable(),
  robotsMeta: z.string().max(300).nullable(),
  xRobotsTag: z.string().max(300).nullable(),
  htmlLang: z.string().max(50).nullable(),
  viewportMeta: z.string().max(300).nullable(),
  headings: z.array(z.object({ level: z.number().int().min(1).max(6), text: z.string().max(500) })).max(80),
  hreflang: z.array(z.object({ evidenceId, lang: z.string().max(50), href: z.string().max(2000) })).max(50),
  openGraph: z.array(z.object({ evidenceId, property: z.string().max(100), content: z.string().max(1000) })).max(30),
  jsonLd: z.array(jsonLdEvidence).max(10),
  links: z.array(z.object({ text: z.string().max(300), href: z.string().max(2000), sameOrigin: z.boolean() })).max(150),
  pageStatus: z.object({ initialStatus: httpStatus.nullable(), finalStatus: httpStatus.nullable(), redirectChain: z.array(z.object({ from: z.string().max(2000), to: z.string().max(2000), status: httpStatus })).max(20) }),
});

const performanceEvidence = z.object({
  lab: z.object({ lcp: z.number().nonnegative().nullable(), cls: z.number().nonnegative().nullable(), tbt: z.number().nonnegative().nullable(), ttfb: z.number().nonnegative().nullable(), source: z.literal("lighthouse"), lighthouseVersion: z.string().max(50) }),
  field: z.object({
    source: z.enum(["not-integrated", "crux"]),
    status: z.enum(["not-assessed", "insufficient-data", "available"]),
    percentile: z.literal(75).nullable(),
    periodDays: z.number().int().nonnegative().nullable(),
    lcp: z.number().nonnegative().nullable(),
    cls: z.number().nonnegative().nullable(),
    inp: z.number().nonnegative().nullable(),
  }).superRefine((val, ctx) => {
    if (val.status === "available") {
      if (val.lcp === null || val.cls === null || val.inp === null) ctx.addIssue({ code: "custom", message: "available field metrics require non-null lcp/cls/inp" });
      if (val.percentile === null || val.periodDays === null) ctx.addIssue({ code: "custom", message: "available field metrics require percentile/periodDays" });
    } else {
      if (val.lcp !== null || val.cls !== null || val.inp !== null) ctx.addIssue({ code: "custom", message: `${val.status} requires null lcp/cls/inp` });
    }
  }),
  testConditions: z.object({
    formFactor: z.enum(["desktop", "mobile"]),
    throttlingMethod: z.string().max(100).nullable(),
    cpuThrottling: z.string().max(100).nullable(),
    networkProfile: z.string().max(100).nullable(),
    locale: z.string().max(20),
    lighthouseVersion: z.string().max(50),
    runCount: z.number().int().min(1),
    limitations: z.array(z.string().max(300)).max(10),
  }),
});

const accessibilityObservation = z.object({ evidenceId, id: z.string().max(100), title: z.string().max(300), impact: z.string().max(50).optional() });

const accessibilityEvidence = z.object({
  standard: z.literal("WCAG 2.2"),
  desktop: z.object({
    automatedChecks: z.object({ source: z.literal("lighthouse"), status: z.literal("verified"), score: z.number().min(0).max(100), failedAudits: z.array(accessibilityObservation).max(30) }),
    browserObservations: z.object({ imagesWithoutAlt: z.number().nonnegative(), formInputsWithoutLabel: z.number().nonnegative(), landmarksPresent: z.array(z.string().max(50)).max(10) }),
  }),
  mobile: z.object({
    automatedChecks: z.object({ source: z.literal("lighthouse"), status: z.literal("not-assessed"), score: z.null(), failedAudits: z.array(accessibilityObservation).max(0) }),
    browserObservations: z.object({ imagesWithoutAlt: z.number().nonnegative(), formInputsWithoutLabel: z.number().nonnegative(), landmarksPresent: z.array(z.string().max(50)).max(10) }),
  }),
  requiresHumanVerification: z.array(z.string().max(200)).max(20),
});
```

- [ ] **Step 2: Top-level schema with cross-object invariant**

```ts
export const AuditEvidenceV2Schema = z.object({
  contractVersion: z.literal(2),
  methodology: methodologyBase,
  seo: seoEvidence,
  desktop: viewportEvidence,
  mobile: viewportEvidence,
  performance: performanceEvidence,
  accessibility: accessibilityEvidence,
}).superRefine((val, ctx) => {
  if (val.mobile.ctaJourneys === null) {
    const hasSkipRecord = val.methodology.tests.some((t) => t.id === "cta-journey-mobile" && t.status === "skipped" && t.reason);
    if (!hasSkipRecord) ctx.addIssue({ code: "custom", message: "mobile.ctaJourneys=null requires a cta-journey-mobile skipped test record with a reason" });
  }
});
```

- [ ] **Step 3: Typecheck**

`docker-compose run --rm web npx tsc --noEmit`. The full invariant behavior is exercised by Task A5's committed test, not a throwaway script — writing the fixtures once, as real committed tests, replaces the earlier "manual verification script + delete it" pattern for exactly the reason Task A5 exists.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/evidence-schema.ts
git commit -m "feat: add Zod schema enforcing Evidence Contract v2 invariants"
```

---

### Task A4: Legacy derivation functions

**Files:** Create `src/lib/audit/evidence-legacy.ts`

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
    case "navigated": return `Loaded: ${journey.finalUrl ?? journey.declaredUrl}`;
    case "redirected": return `Loaded after redirect: ${journey.finalUrl ?? journey.declaredUrl}`;
    case "http-error": return `HTTP ${journey.httpStatus ?? "error"}`;
    case "network-error": return journey.error ?? "Could not load";
    case "blocked-unsafe-redirect": return "Blocked: unsafe redirect destination";
    case "external-not-visited": return "External destination detected";
    case "skipped-limit": return "Not tested — audit is capped at the first 5 conversion paths";
    case "skipped-invalid-url": return "Not tested — invalid or unsupported URL";
  }
}
```

- [ ] Typecheck, lint, commit:

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/evidence-legacy.ts
git add src/lib/audit/evidence-legacy.ts
git commit -m "feat: derive legacy cookieBanner/ctaJourneys fields from v2 evidence"
```

---

### Task A5: Committed verification test (`node:test`)

**Files:**
- Create: `src/lib/audit/__tests__/evidence.test.ts`
- Modify: `package.json` (add a `test` script — no new dependency; `node:test` is built into Node, run through the already-present `tsx` loader)

- [ ] **Step 1: Add the npm script**

```json
"test": "node --import tsx --test src/lib/audit/__tests__/**/*.test.ts"
```

- [ ] **Step 2: Write the test file**

```ts
// src/lib/audit/__tests__/evidence.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeUrl, sanitizeText, sanitizeEvidenceV2, hashContent } from "@/lib/audit/evidence-sanitize";
import { makeEvidenceId } from "@/lib/audit/evidence-id";
import { AuditEvidenceV2Schema } from "@/lib/audit/evidence-schema";
import { deriveLegacyCookieBanner, deriveLegacyCtaJourneys } from "@/lib/audit/evidence-legacy";
import type { AuditEvidenceV2, CtaJourneyEvidence } from "@/lib/audit/evidence-types";

function validEvidence(): AuditEvidenceV2 {
  // A minimal but fully-valid fixture — every test below clones and mutates this.
  return {
    contractVersion: 2,
    methodology: { contractVersion: 2, startedAt: "2026-07-11T00:00:00.000Z", finishedAt: "2026-07-11T00:01:00.000Z", requestedUrl: "https://example.com", finalUrl: "https://example.com/", pageGoal: "signups", scope: "single-page", viewports: { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } }, userAgent: { desktop: "d", mobile: "m" }, tool: { lighthouseVersion: "12.8.2" }, redirects: [], tests: [{ id: "desktop-dom", status: "passed" }, { id: "cta-journey-mobile", status: "skipped", reason: "single-page audit tests conversion paths once, on desktop" }], limitations: [] },
    seo: { title: "t", metaDescription: null, canonical: null, robotsMeta: null, xRobotsTag: null, htmlLang: null, viewportMeta: null, headings: [], hreflang: [], openGraph: [], jsonLd: [], links: [], pageStatus: { initialStatus: 200, finalStatus: 200, redirectChain: [] } },
    desktop: { browser: { viewport: "desktop", headline: null, headingHierarchy: [], aboveFold: { text: "", ctaTexts: [], imageCount: 0 }, ctasVisible: [], navPresent: false, hasHorizontalOverflow: null, overlapCandidates: null, overlapCandidatesStatus: "not-assessed", smallTapTargetCandidates: null, smallTapTargetCandidatesStatus: "not-assessed", forms: [], landmarks: { hasNav: false, hasFooter: false, hasMain: false }, images: [], cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] } }, console: { consoleErrors: [], pageErrors: [], failedRequests: [], limits: { maxConsoleErrors: 20, maxFailedRequests: 20, truncated: false } }, ctaJourneys: [] },
    mobile: { browser: { viewport: "mobile", headline: null, headingHierarchy: [], aboveFold: { text: "", ctaTexts: [], imageCount: 0 }, ctasVisible: [], navPresent: false, hasHorizontalOverflow: null, overlapCandidates: null, overlapCandidatesStatus: "not-assessed", smallTapTargetCandidates: null, smallTapTargetCandidatesStatus: "not-assessed", forms: [], landmarks: { hasNav: false, hasFooter: false, hasMain: false }, images: [], cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] } }, console: { consoleErrors: [], pageErrors: [], failedRequests: [], limits: { maxConsoleErrors: 20, maxFailedRequests: 20, truncated: false } }, ctaJourneys: null },
    performance: { lab: { lcp: null, cls: null, tbt: null, ttfb: null, source: "lighthouse", lighthouseVersion: "12.8.2" }, field: { source: "not-integrated", status: "not-assessed", percentile: null, periodDays: null, lcp: null, cls: null, inp: null }, testConditions: { formFactor: "desktop", throttlingMethod: null, cpuThrottling: null, networkProfile: null, locale: "en-US", lighthouseVersion: "12.8.2", runCount: 1, limitations: ["single lab run"] } },
    accessibility: { standard: "WCAG 2.2", desktop: { automatedChecks: { source: "lighthouse", status: "verified", score: 90, failedAudits: [] }, browserObservations: { imagesWithoutAlt: 0, formInputsWithoutLabel: 0, landmarksPresent: [] } }, mobile: { automatedChecks: { source: "lighthouse", status: "not-assessed", score: null, failedAudits: [] }, browserObservations: { imagesWithoutAlt: 0, formInputsWithoutLabel: 0, landmarksPresent: [] } }, requiresHumanVerification: ["keyboard trap testing"] },
  };
}

test("sanitizeUrl strips fragment and redacts query string", () => {
  assert.equal(sanitizeUrl("https://example.com/path?token=abc123#section"), "https://example.com/path?[redacted]");
});

test("sanitizeText redacts email, JWT, bearer token, UUID, private IP", () => {
  const out = sanitizeText("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U user@example.com 550e8400-e29b-41d4-a716-446655440000 10.0.0.5", 1000);
  assert.match(out, /\[redacted-jwt\]/);
  assert.match(out, /\[redacted-email\]/);
  assert.match(out, /\[redacted-uuid\]/);
  assert.match(out, /\[redacted-private-address\]/);
  assert.doesNotMatch(out, /10\.0\.0\.5/);
});

test("sanitizeEvidenceV2 redacts nested URL/text fields without changing structure", () => {
  const evidence = validEvidence();
  evidence.desktop.browser.ctasVisible.push({ text: "click me", href: "https://example.com/x?email=user@example.com", tag: "a", position: "above-fold" });
  const sanitized = sanitizeEvidenceV2(evidence);
  assert.equal(sanitized.desktop.browser.ctasVisible.length, 1);
  assert.doesNotMatch(sanitized.desktop.browser.ctasVisible[0].href, /user@example\.com/);
});

test("makeEvidenceId is deterministic and distinguishes different content", () => {
  const a1 = makeEvidenceId("cta", "https://x.com/a", "Start free");
  const a2 = makeEvidenceId("cta", "https://x.com/a", "Start free");
  const b = makeEvidenceId("cta", "https://x.com/b", "Start free");
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
});

test("evidenceIds are unique across a realistic evidence object", () => {
  const evidence = validEvidence();
  const ids = [
    makeEvidenceId("cta", "https://x.com/a", "A"),
    makeEvidenceId("cta", "https://x.com/b", "B"),
    makeEvidenceId("console", "TypeError: x is not defined"),
    makeEvidenceId("network", "https://x.com/broken.png", "image"),
  ];
  assert.equal(new Set(ids).size, ids.length);
  void evidence;
});

test("valid evidence parses successfully", () => {
  assert.equal(AuditEvidenceV2Schema.safeParse(validEvidence()).success, true);
});

test("blocking=true with blockingStatus=not-assessed is rejected", () => {
  const evidence = validEvidence();
  evidence.desktop.browser.cookieBanner = { ...evidence.desktop.browser.cookieBanner, detected: true, blocking: true, blockingStatus: "not-assessed" };
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("navigated outcome without finalUrl is rejected", () => {
  const evidence = validEvidence();
  const journey: CtaJourneyEvidence = { evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), text: "A", element: "a", declaredUrl: "https://x.com/a", sameOrigin: true, navigationAttempted: true, outcome: "navigated" };
  evidence.desktop.ctaJourneys = [journey];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("redirected outcome with redirectCount=0 is rejected", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [{ evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), text: "A", element: "a", declaredUrl: "https://x.com/a", sameOrigin: true, navigationAttempted: true, finalUrl: "https://x.com/a", redirectCount: 0, httpStatus: 200, outcome: "redirected" }];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("blocked-unsafe-redirect without error field is rejected", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [{ evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), text: "A", element: "a", declaredUrl: "https://x.com/a", sameOrigin: true, navigationAttempted: true, outcome: "blocked-unsafe-redirect" }];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("blocked-unsafe-redirect with a sanitized error passes and never carries a raw private IP", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [{ evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), text: "A", element: "a", declaredUrl: "https://x.com/a", sameOrigin: true, navigationAttempted: true, outcome: "blocked-unsafe-redirect", error: "Blocked: navigation to a private/unsafe address was prevented" }];
  const result = AuditEvidenceV2Schema.safeParse(evidence);
  assert.equal(result.success, true);
  if (result.success) assert.doesNotMatch(JSON.stringify(result.data), /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
});

test("field performance status=available without values is rejected", () => {
  const evidence = validEvidence();
  evidence.performance.field = { source: "crux", status: "available", percentile: 75, periodDays: 28, lcp: null, cls: null, inp: null };
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("mobile.ctaJourneys=null without a cta-journey-mobile skip record is rejected", () => {
  const evidence = validEvidence();
  evidence.methodology.tests = evidence.methodology.tests.filter((t) => t.id !== "cta-journey-mobile");
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("invalid evidence is ignored, not thrown, when parsed with safeParse (mirrors db/audits.ts read path)", () => {
  const evidence = validEvidence();
  (evidence as unknown as { performance: unknown }).performance = "not an object";
  const result = AuditEvidenceV2Schema.safeParse(evidence);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.length > 0);
});

test("deriveLegacyCookieBanner mirrors detected/dismissed exactly", () => {
  const legacy = deriveLegacyCookieBanner({ detected: true, dismissAttempted: true, dismissed: false, blocking: true, blockingStatus: "verified", buttonsFound: ["Accept"] });
  assert.deepEqual(legacy, { detected: true, dismissed: false });
});

test("deriveLegacyCtaJourneys maps CTA<->screenshot by evidenceId-scoped screenshotRef, not array position", () => {
  const journeys: CtaJourneyEvidence[] = [
    { evidenceId: "cta:aaa", text: "A", element: "a", declaredUrl: "https://x.com/a", sameOrigin: true, navigationAttempted: true, finalUrl: "https://x.com/a", redirectCount: 0, httpStatus: 200, outcome: "navigated", screenshotRef: "https://storage/a.jpg" },
    { evidenceId: "cta:bbb", text: "B", element: "a", declaredUrl: "https://x.com/b", sameOrigin: true, navigationAttempted: true, finalUrl: "https://x.com/b", redirectCount: 0, httpStatus: 200, outcome: "navigated", screenshotRef: "https://storage/b.jpg" },
  ];
  const legacy = deriveLegacyCtaJourneys(journeys);
  assert.equal(legacy[0].screenshotPath, "https://storage/a.jpg");
  assert.equal(legacy[1].screenshotPath, "https://storage/b.jpg");
});

test("no Buffer or absolute local filesystem path survives into a schema-valid evidence object", () => {
  const evidence = validEvidence();
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /"type":"Buffer"/);
  assert.doesNotMatch(serialized, /\/Volumes\/|\/private\/tmp\/|\/Users\//);
});

test("hashContent is deterministic", () => {
  assert.equal(hashContent("<script>{}</script>"), hashContent("<script>{}</script>"));
});
```

- [ ] **Step 3: Run it**

```bash
docker-compose run --rm web npm test
```
Expected: all tests pass. This is Checkpoint A's gate — do not proceed to Checkpoint B until every test above is green.

- [ ] **Step 4: Commit**

```bash
git add package.json src/lib/audit/__tests__/evidence.test.ts
git commit -m "test: add committed node:test suite for Evidence Contract v2 invariants"
```

- [ ] **Checkpoint A self-review:** re-read Tasks A1-A5 against Global Constraints — every repeatable record has `evidenceId`; every uncertain field has a `null`/`...Status` pair; the schema's `superRefine`s cover every invariant listed; the committed test exercises sanitization, ID determinism/uniqueness, every invariant, legacy derivation, invalid-evidence handling, CTA↔screenshot-by-id mapping, and no-Buffer-serialization. Fix anything missing before starting Checkpoint B.

---

## Checkpoint B — Scanner

### Task B1: Per-viewport `extract()` and geometry candidates, with IDs, time/size limits, honest "inferred" status

**Files:** Modify `src/lib/audit/browser-scanner.ts`

- [ ] **Step 1: `extractEvidence()`**

Add after the existing `extract()`. Bounded by both element-count caps (already present) and a wall-clock budget inside the page context (`performance.now()`), so a pathological page can't hang the scan:

```ts
import { makeEvidenceId } from "@/lib/audit/evidence-id";

async function extractEvidence(page: Page, viewport: "desktop" | "mobile"): Promise<import("@/lib/audit/evidence-types").BrowserEvidence> {
  const GEOMETRY_TIME_BUDGET_MS = 2000;
  const geometry = await page.evaluate((budgetMs: number) => {
    const start = performance.now();
    const timeLeft = () => performance.now() - start < budgetMs;
    const rects = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    const hasHorizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const describeSelector = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`;

    const overlapCandidates: { selector: string; overlapsWithSelector: string; issue: "cutoff" | "overlap"; boundingBox: { x: number; y: number; width: number; height: number } }[] = [];
    for (const a of rects.slice(0, 400)) {
      if (!timeLeft() || overlapCandidates.length >= 30) break;
      const aRect = a.getBoundingClientRect();
      const parent = a.parentElement;
      if (parent) {
        const pRect = parent.getBoundingClientRect();
        if (aRect.right > pRect.right + 2 || aRect.bottom > pRect.bottom + 2) {
          overlapCandidates.push({ selector: describeSelector(a), overlapsWithSelector: describeSelector(parent), issue: "cutoff", boundingBox: { x: aRect.x, y: aRect.y, width: aRect.width, height: aRect.height } });
        }
      }
    }

    const smallTapTargetCandidates: { selector: string; boundingBox: { x: number; y: number; width: number; height: number }; widthPx: number; heightPx: number }[] = [];
    const interactive = rects.filter((el) => el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.tagName === "INPUT");
    for (const el of interactive.slice(0, 200)) {
      if (!timeLeft() || smallTapTargetCandidates.length >= 30) break;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) smallTapTargetCandidates.push({ selector: describeSelector(el), boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height }, widthPx: Math.round(r.width), heightPx: Math.round(r.height) });
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
    const forms = [...document.forms].map((form) => ({ action: form.action, inputs: [...form.elements].map((field) => { const input = field as HTMLInputElement; const hasLabel = Boolean(input.labels?.length) || Boolean(input.getAttribute("aria-label")) || Boolean(input.getAttribute("aria-labelledby")); return { name: input.name || "", type: input.type || input.tagName.toLowerCase(), hasLabel }; }).slice(0, 30) })).slice(0, 20);
    const images = [...document.images].slice(0, 50).map((img) => ({ src: img.src, hasAlt: img.alt.trim().length > 0, aboveFold: img.getBoundingClientRect().top < window.innerHeight }));

    return { hasHorizontalOverflow, overlapCandidates, smallTapTargetCandidates, headline, headingHierarchy, ctasVisible, navPresent: Boolean(document.querySelector("nav")), aboveFold: { text: aboveFoldText, ctas: aboveFoldCtas, imageCount }, forms, landmarks: { hasNav: Boolean(document.querySelector("nav")), hasFooter: Boolean(document.querySelector("footer")), hasMain: Boolean(document.querySelector("main")) }, images };
  }, GEOMETRY_TIME_BUDGET_MS);

  return {
    viewport,
    headline: geometry.headline,
    headingHierarchy: geometry.headingHierarchy,
    aboveFold: { text: geometry.aboveFold.text, ctaTexts: geometry.aboveFold.ctas, imageCount: geometry.aboveFold.imageCount },
    ctasVisible: geometry.ctasVisible,
    navPresent: geometry.navPresent,
    hasHorizontalOverflow: geometry.hasHorizontalOverflow,
    // Geometry itself is "verified" — it was measured. Whether a candidate represents a
    // real problem is always "inferred": an overlay can be intentional, a small target
    // can satisfy one of WCAG 2.5.8's five exceptions. Never claim "verified" on the
    // conclusion, only on the fact that the scan ran.
    overlapCandidates: geometry.overlapCandidates.map((c) => ({ ...c, evidenceId: makeEvidenceId("overlap", viewport, c.selector, c.issue), status: "inferred" as const })),
    overlapCandidatesStatus: "verified",
    smallTapTargetCandidates: viewport === "mobile" ? geometry.smallTapTargetCandidates.map((c) => ({ ...c, evidenceId: makeEvidenceId("tap-target", viewport, c.selector), status: "inferred" as const })) : null,
    smallTapTargetCandidatesStatus: viewport === "mobile" ? "verified" : "not-assessed",
    forms: geometry.forms,
    landmarks: geometry.landmarks,
    images: geometry.images,
    cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] },
  };
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: per-viewport geometry extraction with evidenceId and honest inferred status"
```

---

### Task B2: Cookie banner — detect/dismiss split, blocking check, screenshot-only-if-detected with size cap

**Files:** Modify `src/lib/audit/browser-scanner.ts`

- [ ] **Step 1: Replace `dismissCookieBanner()`**

```ts
const MAX_SCREENSHOT_BYTES = 3_000_000;

function capScreenshot(buffer: Buffer): Buffer | undefined {
  return buffer.length <= MAX_SCREENSHOT_BYTES ? buffer : undefined;
}

async function detectAndDismissCookieBanner(page: Page): Promise<{ evidence: import("@/lib/audit/evidence-types").CookieBannerEvidence; beforeScreenshot?: Buffer; afterScreenshot?: Buffer }> {
  const detection = await page.evaluate((patterns: string[]) => {
    const regexes = patterns.map((p) => new RegExp(p, "i"));
    const candidates = [...document.querySelectorAll("[class*=cookie i],[id*=cookie i],[class*=consent i],[id*=consent i],[role=dialog]")];
    const banner = candidates.find((el) => { const rect = el.getBoundingClientRect(); const style = window.getComputedStyle(el); return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"; });
    if (!banner) return { detected: false, buttonsFound: [] as string[], blocking: null as boolean | null };
    const buttons = [...banner.querySelectorAll("button,a[role=button],a")].map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 10);
    const style = window.getComputedStyle(banner);
    const rect = banner.getBoundingClientRect();
    const coversMost = rect.width >= window.innerWidth * 0.6 && rect.height >= window.innerHeight * 0.6;
    const isFixedOrSticky = style.position === "fixed" || style.position === "sticky";
    const bodyLocked = window.getComputedStyle(document.body).overflow === "hidden";
    return { detected: true, buttonsFound: buttons, blocking: (coversMost && isFixedOrSticky) || bodyLocked };
  }, COOKIE_CONSENT_PATTERNS.map((p) => p.source));

  // Screenshots are captured only when a banner was actually detected — never
  // speculatively, and never for a page with no banner at all.
  if (!detection.detected) {
    return { evidence: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] } };
  }

  let beforeScreenshot: Buffer | undefined;
  try { beforeScreenshot = capScreenshot(Buffer.from(await page.screenshot({ type: "jpeg", quality: 70 }))); } catch { /* best-effort */ }

  let dismissed = false;
  for (const pattern of COOKIE_CONSENT_PATTERNS) {
    const button = page.getByRole("button", { name: pattern }).first();
    try {
      if (await button.isVisible({ timeout: 400 })) { await button.click({ timeout: 1500 }); await page.waitForTimeout(400); dismissed = true; break; }
    } catch { /* pattern not present, try the next one */ }
  }

  let afterScreenshot: Buffer | undefined;
  try { afterScreenshot = capScreenshot(Buffer.from(await page.screenshot({ type: "jpeg", quality: 70 }))); } catch { /* best-effort */ }

  return {
    evidence: { detected: true, dismissAttempted: true, dismissed, blocking: detection.blocking, blockingStatus: detection.blocking === null ? "not-assessed" : "verified", buttonsFound: detection.buttonsFound },
    beforeScreenshot,
    afterScreenshot,
  };
}
```

- [ ] **Step 2: Wire into `scanHomepage()`** (desktop and mobile passes), using `deriveLegacyCookieBanner` for the legacy field: `pageData.cookieBanner = deriveLegacyCookieBanner(cookieDesktop.evidence);`, with `import { deriveLegacyCookieBanner } from "@/lib/audit/evidence-legacy";` added.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: cookie banner detect/dismiss split, screenshot only if detected, size cap"
```

---

### Task B3: CTA journeys — evidenceId, `blocked-unsafe-redirect`, screenshot-by-id

**Files:** Modify `src/lib/audit/browser-scanner.ts`

- [ ] **Step 1: Replace `testCtaJourneys()`**

```ts
async function countRedirects(response: import("playwright").Response | null): Promise<number> {
  let count = 0;
  let current = response?.request().redirectedFrom() ?? null;
  while (current) { count += 1; current = current.redirectedFrom(); }
  return count;
}

function isSafetyBlock(message: string): boolean {
  return /blockedbyclient|private network|resolves to a private|cannot be audited|could not be resolved/i.test(message);
}

async function testCtaJourneysEvidence(context: BrowserContext, sourceUrl: string, ctas: ExtractedPage["ctas"]): Promise<{ evidence: import("@/lib/audit/evidence-types").CtaJourneyEvidence; screenshot?: Buffer }[]> {
  const source = new URL(sourceUrl);
  const httpCandidates = ctas.filter((cta) => { try { return ["http:", "https:"].includes(new URL(cta.href, source).protocol); } catch { return false; } });
  const invalidCandidates = ctas.filter((cta) => !httpCandidates.includes(cta));
  const tested = httpCandidates.slice(0, 5);
  const overLimit = httpCandidates.slice(5);

  const testedResults = await Promise.all(tested.map(async (cta) => {
    const destination = new URL(cta.href, source);
    const sameOrigin = destination.origin === source.origin;
    const evidenceId = makeEvidenceId("cta", destination.toString(), cta.text);
    if (!sameOrigin) {
      return { evidence: { evidenceId, text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin, navigationAttempted: false, outcome: "external-not-visited" as const, skippedReason: "External destination — not navigated in this audit" } };
    }
    const probe = await context.newPage();
    try {
      const response = await probe.goto(destination.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 });
      await assertSafeUrl(probe.url());
      const redirectCount = await countRedirects(response);
      const screenshot = response?.ok() ? Buffer.from(await probe.screenshot({ type: "jpeg", quality: 70 })) : undefined;
      const outcome: import("@/lib/audit/evidence-types").CtaOutcome = !response ? "network-error" : !response.ok() ? "http-error" : redirectCount > 0 ? "redirected" : "navigated";
      return { evidence: { evidenceId, text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin, navigationAttempted: true, finalUrl: probe.url(), redirectCount, httpStatus: response?.status(), outcome, error: outcome === "network-error" ? "No response received" : undefined }, screenshot };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load";
      // A redirect toward a private/unsafe address is a deliberate protection firing,
      // not a generic transport failure — record it distinctly, with a fixed generic
      // message so the real (possibly private) address is never persisted.
      if (isSafetyBlock(message)) {
        return { evidence: { evidenceId, text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin, navigationAttempted: true, outcome: "blocked-unsafe-redirect" as const, error: "Blocked: navigation to a private/unsafe address was prevented" } };
      }
      return { evidence: { evidenceId, text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin, navigationAttempted: true, outcome: "network-error" as const, error: message.slice(0, 300) } };
    } finally {
      await probe.close();
    }
  }));

  const overLimitResults = overLimit.map((cta) => {
    const destination = new URL(cta.href, source);
    return { evidence: { evidenceId: makeEvidenceId("cta", destination.toString(), cta.text), text: cta.text, element: cta.tag, declaredUrl: destination.toString(), sameOrigin: destination.origin === source.origin, navigationAttempted: false, outcome: "skipped-limit" as const, skippedReason: "Not tested — audit is capped at the first 5 conversion paths" } };
  });

  const invalidResults = invalidCandidates.map((cta) => ({
    evidence: { evidenceId: makeEvidenceId("cta", cta.href, cta.text), text: cta.text, element: cta.tag, declaredUrl: cta.href, sameOrigin: false, navigationAttempted: false, outcome: "skipped-invalid-url" as const, skippedReason: "Not tested — not an http(s) destination" },
  }));

  return [...testedResults, ...overLimitResults, ...invalidResults];
}
```

A CTA journey never throws out of this function — `blocked-unsafe-redirect` is returned as a normal evidence record, so a private-address redirect **cannot fail the whole audit**; it only marks that one journey.

- [ ] **Step 2: Screenshot upload matched by `evidenceId`, not array index**

Change `uploadCtaScreenshots` (Checkpoint C's storage-layer task) to accept `{ evidenceId, buffer }[]` and return `{ evidenceId, path }[]`, matching back via `ctaJourneys.find((j) => j.evidenceId === evidenceId)` rather than `ctaJourneys[index]`. Update `scanHomepage()`'s `ctaScreenshots` construction to carry `evidenceId` alongside each buffer:

```ts
const ctaScreenshots = ctaResults
  .map((result) => ({ evidenceId: result.evidence.evidenceId, buffer: result.screenshot }))
  .filter((entry): entry is { evidenceId: string; buffer: Buffer } => Boolean(entry.buffer));
```

- [ ] **Step 3: Typecheck, lint, commit**

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: typed CTA outcomes with blocked-unsafe-redirect and id-based screenshot mapping"
```

---

### Task B4: SEO evidence — IDs, redirect chain cap, sanitize-before-hash for JSON-LD

**Files:** Modify `src/lib/audit/browser-scanner.ts`

- [ ] **Step 1: Extend `settle()` to return the navigation `Response`**

```ts
async function settle(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  return response;
}
```

Update both call sites in `scanHomepage()` to capture the return value.

- [ ] **Step 2: `extractSeoEvidence()`**

```ts
import { sanitizeUrl, sanitizeText, redactSensitivePatterns, hashContent } from "@/lib/audit/evidence-sanitize";

async function extractSeoEvidence(page: Page, response: import("playwright").Response | null): Promise<import("@/lib/audit/evidence-types").SeoEvidence> {
  const raw = await page.evaluate(() => {
    const attr = (selector: string, name: string) => document.querySelector(selector)?.getAttribute(name) ?? null;
    return {
      canonical: attr('link[rel="canonical"]', "href"),
      robotsMeta: attr('meta[name="robots"]', "content"),
      htmlLang: document.documentElement.getAttribute("lang"),
      viewportMeta: attr('meta[name="viewport"]', "content"),
      hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((el) => ({ lang: el.getAttribute("hreflang") ?? "", href: (el as HTMLLinkElement).href })).slice(0, 50),
      openGraph: [...document.querySelectorAll('meta[property^="og:"]')].map((el) => ({ property: el.getAttribute("property") ?? "", content: el.getAttribute("content") ?? "" })).slice(0, 30),
      jsonLdScripts: [...document.querySelectorAll('script[type="application/ld+json"]')].map((el) => el.textContent ?? "").slice(0, 10),
      links: [...document.querySelectorAll("a[href]")].map((el) => ({ text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), href: (el as HTMLAnchorElement).href })).slice(0, 150),
      headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((el) => ({ level: Number(el.tagName[1]), text: (el.textContent ?? "").replace(/\s+/g, " ").trim() })).filter((h) => h.text).slice(0, 80),
      title: document.title,
      metaDescription: attr('meta[name="description"]', "content"),
      visibleText: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 30_000),
    };
  });

  const matchableTypes = new Set(["Product", "Article"]);
  const jsonLd: import("@/lib/audit/evidence-types").JsonLdEvidence[] = raw.jsonLdScripts.map((script) => {
    // Redact BEFORE hashing/excerpting — the hash and excerpt must never be derivable
    // back to potentially sensitive raw content the page author embedded.
    const redactedScript = redactSensitivePatterns(script);
    const excerptHash = hashContent(redactedScript);
    const evidenceId = `jsonld:${excerptHash.slice(0, 12)}`;
    try {
      const parsedJson = JSON.parse(script) as Record<string, unknown> & { "@type"?: string | string[] };
      const types = Array.isArray(parsedJson["@type"]) ? (parsedJson["@type"] as string[]) : parsedJson["@type"] ? [parsedJson["@type"] as string] : [];
      const matchableType = types.find((t) => matchableTypes.has(t));
      let contentMatch: boolean | null = null;
      let contentMatchStatus: import("@/lib/audit/evidence-types").EvidenceStatus = "not-assessed";
      if (matchableType) {
        const nameField = (parsedJson.name ?? parsedJson.headline) as string | undefined;
        if (typeof nameField === "string" && nameField.trim()) {
          // A substring match is deterministic but not a robust semantic verification —
          // record it as "inferred", never "verified".
          contentMatch = raw.visibleText.includes(nameField.trim());
          contentMatchStatus = "inferred";
        }
      }
      return { evidenceId, parsed: true, types, excerptHash, sanitizedExcerpt: sanitizeText(redactedScript, 400), contentMatch, contentMatchStatus };
    } catch (error) {
      return { evidenceId, parsed: false, types: [], parseError: sanitizeText(error instanceof Error ? error.message : "Invalid JSON-LD", 300), excerptHash, contentMatch: null, contentMatchStatus: "not-assessed" as const };
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
    hreflang: raw.hreflang.map((h) => ({ evidenceId: makeEvidenceId("hreflang", h.lang, h.href), ...h })),
    openGraph: raw.openGraph.map((og) => ({ evidenceId: makeEvidenceId("og", og.property, og.content), ...og })),
    jsonLd,
    links: raw.links.map((link) => ({ text: link.text, href: sanitizeUrl(link.href), sameOrigin: (() => { try { return new URL(link.href).origin === new URL(raw.canonical ?? response?.url() ?? "").origin; } catch { return false; } })() })),
    pageStatus: { initialStatus: redirectChain[0]?.status ?? response?.status() ?? null, finalStatus: response?.status() ?? null, redirectChain },
  };
}
```

- [ ] **Step 3: Typecheck, lint, commit**

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: SEO evidence extraction with IDs and sanitize-before-hash JSON-LD"
```

---

### Task B5: Console/network evidence with IDs

**Files:** Modify `src/lib/audit/browser-scanner.ts`

```ts
const MAX_CONSOLE_ERRORS = 20;
const MAX_FAILED_REQUESTS = 20;

function attachConsoleNetworkCapture(page: Page): () => import("@/lib/audit/evidence-types").ConsoleNetworkEvidence {
  const consoleErrors: { message: string; timestamp: string }[] = [];
  const pageErrors: { message: string; timestamp: string }[] = [];
  const failedRequests: { url: string; resourceType: string; domain: string; status: number | null; message?: string }[] = [];
  let truncated = false;

  page.on("console", (message) => { if (message.type() !== "error") return; if (consoleErrors.length >= MAX_CONSOLE_ERRORS) { truncated = true; return; } consoleErrors.push({ message: sanitizeText(message.text(), 500), timestamp: new Date().toISOString() }); });
  page.on("pageerror", (error) => { if (pageErrors.length >= MAX_CONSOLE_ERRORS) { truncated = true; return; } pageErrors.push({ message: sanitizeText(error.message, 500), timestamp: new Date().toISOString() }); });
  page.on("requestfailed", (request) => { if (failedRequests.length >= MAX_FAILED_REQUESTS) { truncated = true; return; } let domain = ""; try { domain = new URL(request.url()).hostname; } catch { /* ignore */ } failedRequests.push({ url: sanitizeUrl(request.url()), resourceType: request.resourceType(), domain, status: null, message: sanitizeText(request.failure()?.errorText ?? "Request failed", 300) }); });
  page.on("response", (response) => { if (response.status() < 400) return; if (failedRequests.length >= MAX_FAILED_REQUESTS) { truncated = true; return; } let domain = ""; try { domain = new URL(response.url()).hostname; } catch { /* ignore */ } failedRequests.push({ url: sanitizeUrl(response.url()), resourceType: response.request().resourceType(), domain, status: response.status() }); });

  return () => ({
    consoleErrors: dedupe(consoleErrors).map((e) => ({ evidenceId: makeEvidenceId("console", e.message), ...e })),
    pageErrors: dedupe(pageErrors).map((e) => ({ evidenceId: makeEvidenceId("pageerror", e.message), ...e })),
    failedRequests: failedRequests.map((r) => ({ evidenceId: makeEvidenceId("network", r.url, r.resourceType), ...r })),
    limits: { maxConsoleErrors: MAX_CONSOLE_ERRORS, maxFailedRequests: MAX_FAILED_REQUESTS, truncated },
  });
}

function dedupe<T extends { message: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.message) ? false : (seen.add(item.message), true)));
}
```

Wire `attachConsoleNetworkCapture(page)` before each viewport's `settle()` call, capture the result after.

- [ ] Typecheck, lint, commit:

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts
git add src/lib/audit/browser-scanner.ts
git commit -m "feat: console/network evidence capture with evidenceId"
```

- [ ] **Checkpoint B self-review:** every scanner-produced record (overlap, tap-target, CTA, console, network, hreflang, OG, JSON-LD) carries `evidenceId`; cookie screenshots only exist when detected and are size-capped; CTA screenshot matching is by `evidenceId`; the SSRF-blocked CTA path never throws out of `testCtaJourneysEvidence`; redirect chain is capped at 20 matching the schema. Fix anything missing before Checkpoint C.

---

## Checkpoint C — Assembly

### Task C1: Performance evidence from real Lighthouse config, and the `raw_lighthouse_json` privacy fix

**Files:** Modify `src/lib/audit/lighthouse-scanner.ts`

- [ ] **Step 1: Fix `inpOrTbt`, read real config for `testConditions`, stop persisting full `lhr`, return `lhr` separately for the accessibility helper**

```ts
inpOrTbt: numeric(audits["total-blocking-time"]), // was: numeric(audits["interaction-to-next-paint"] ?? audits["total-blocking-time"])
```

Change the function's return type to `Promise<{ metrics: AuditMetrics; evidence: PerformanceEvidence; lhr: import("lighthouse").Result }>` (the raw `lhr` travels separately now, since `metrics.raw` no longer holds it — see below) and assemble:

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
  // Only a small, explicitly sanitized diagnostic subset — never the full lhr object,
  // which can carry unsanitized URLs/query strings from every request Lighthouse made.
  raw: { requestedUrl: sanitizeUrl(lhr.requestedUrl ?? ""), finalUrl: sanitizeUrl(lhr.finalUrl ?? ""), fetchTime: lhr.fetchTime, lighthouseVersion: lhr.lighthouseVersion },
};

const throttling = lhr.configSettings.throttling;
const evidence: import("@/lib/audit/evidence-types").PerformanceEvidence = {
  lab: { lcp: metrics.lcp, cls: metrics.cls, tbt: metrics.inpOrTbt, ttfb: metrics.ttfb, source: "lighthouse", lighthouseVersion: lhr.lighthouseVersion },
  field: { source: "not-integrated", status: "not-assessed", percentile: null, periodDays: null, lcp: null, cls: null, inp: null },
  testConditions: {
    formFactor: (lhr.configSettings.formFactor as "desktop" | "mobile" | undefined) ?? "desktop",
    throttlingMethod: lhr.configSettings.throttlingMethod ?? null,
    cpuThrottling: throttling?.cpuSlowdownMultiplier != null ? `${throttling.cpuSlowdownMultiplier}x` : null,
    networkProfile: throttling?.downloadThroughputKbps != null ? `${throttling.downloadThroughputKbps}kbps down / ${throttling.uploadThroughputKbps}kbps up` : null,
    locale: lhr.configSettings.locale ?? "en-US",
    lighthouseVersion: lhr.lighthouseVersion,
    runCount: 1,
    limitations: ["single lab run — not averaged across executions", "desktop viewport only"],
  },
};

return { metrics, evidence, lhr };
```

Add `import { sanitizeUrl } from "@/lib/audit/evidence-sanitize";` to `lighthouse-scanner.ts`. Grep `runLighthouse(` across `src/` and update every call site to destructure the new 3-field return.

- [ ] **Step 2: Automated-accessibility-checks helper**

```ts
export function buildAutomatedAccessibilityChecks(lhr: import("lighthouse").Result): import("@/lib/audit/evidence-types").AccessibilityEvidence["desktop"]["automatedChecks"] {
  const accessibilityAudits = Object.values(lhr.audits).filter((audit) => lhr.categories.accessibility?.auditRefs.some((ref) => ref.id === audit.id));
  const failedAudits = accessibilityAudits.filter((audit) => audit.score !== null && Number(audit.score) < 1).map((audit) => ({ evidenceId: makeEvidenceId("accessibility", "desktop", audit.id), id: audit.id, title: audit.title }));
  return { source: "lighthouse", status: "verified", score: score(lhr.categories.accessibility?.score), failedAudits };
}
```

Add `import { makeEvidenceId } from "@/lib/audit/evidence-id";` to `lighthouse-scanner.ts`.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/lighthouse-scanner.ts
git add src/lib/audit/lighthouse-scanner.ts
git commit -m "fix: read Lighthouse test conditions from real config, stop persisting full raw JSON"
```

---

### Task C2: Storage layer — id-based CTA screenshot matching, precise cookie-screenshot failure reporting

**Files:** Modify `src/lib/storage/screenshots.ts`

```ts
export async function uploadCtaScreenshots(auditId: string, screenshots: { evidenceId: string; buffer: Buffer }[]) {
  if (!screenshots.length) return [];
  const bucket = process.env.SUPABASE_SCREENSHOTS_BUCKET ?? "audit-screenshots";
  const db = getSupabaseAdmin();
  return Promise.all(screenshots.map(async ({ evidenceId, buffer }) => {
    const path = `${auditId}/cta-${evidenceId.replace(/[^a-z0-9-]/gi, "_")}.jpg`;
    const { error } = await db.storage.from(bucket).upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    const { data } = db.storage.from(bucket).getPublicUrl(path);
    return { evidenceId, path: data.publicUrl };
  }));
}

export async function uploadCookieBannerScreenshots(auditId: string, buffers: { desktop: { before?: Buffer; after?: Buffer }; mobile: { before?: Buffer; after?: Buffer } }) {
  const bucket = process.env.SUPABASE_SCREENSHOTS_BUCKET ?? "audit-screenshots";
  const db = getSupabaseAdmin();
  const jobs: { key: "desktop.before" | "desktop.after" | "mobile.before" | "mobile.after"; buffer: Buffer; path: string }[] = [];
  if (buffers.desktop.before) jobs.push({ key: "desktop.before", buffer: buffers.desktop.before, path: `${auditId}/cookie-banner-desktop-before.jpg` });
  if (buffers.desktop.after) jobs.push({ key: "desktop.after", buffer: buffers.desktop.after, path: `${auditId}/cookie-banner-desktop-after.jpg` });
  if (buffers.mobile.before) jobs.push({ key: "mobile.before", buffer: buffers.mobile.before, path: `${auditId}/cookie-banner-mobile-before.jpg` });
  if (buffers.mobile.after) jobs.push({ key: "mobile.after", buffer: buffers.mobile.after, path: `${auditId}/cookie-banner-mobile-after.jpg` });

  const results: { desktop: { before?: string; after?: string }; mobile: { before?: string; after?: string } } = { desktop: {}, mobile: {} };
  const failedStages: string[] = [];
  await Promise.all(jobs.map(async (job) => {
    const { error } = await db.storage.from(bucket).upload(job.path, job.buffer, { contentType: "image/jpeg", upsert: true });
    if (error) { failedStages.push(job.key); return; }
    const { data } = db.storage.from(bucket).getPublicUrl(job.path);
    const [viewport, phase] = job.key.split(".") as ["desktop" | "mobile", "before" | "after"];
    results[viewport][phase] = data.publicUrl;
  }));
  return { ...results, failedStages };
}
```

`failedStages` (e.g. `["mobile.after"]`) replaces a blanket boolean, so a partial failure can be recorded precisely in `methodology.tests`.

- [ ] Typecheck, lint, commit:

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/storage/screenshots.ts
git add src/lib/storage/screenshots.ts
git commit -m "feat: id-based CTA screenshot matching, precise cookie-screenshot failure reporting"
```

---

### Task C3: Full pipeline wiring — assemble, sanitize, validate, persist; clear Buffers after upload

**Files:** Modify `src/lib/audit/browser-scanner.ts` (`BrowserScanResult`/`scanHomepage()`), `src/lib/audit/process-audit.ts`

- [ ] **Step 1: `BrowserScanResult` and `scanHomepage()` assemble `evidenceParts`**

```ts
export interface BrowserScanResult {
  page: ExtractedPage;
  desktopScreenshot: Buffer;
  mobileScreenshot: Buffer;
  ctaScreenshots: { evidenceId: string; buffer: Buffer }[];
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

Rewrite `scanHomepage()`'s body to thread every Checkpoint B piece together (per-viewport `extractEvidence`, `detectAndDismissCookieBanner`, `testCtaJourneysEvidence`, `extractSeoEvidence`, `attachConsoleNetworkCapture`), accumulating a `tests: TestExecutionRecord[]` array as each step completes, exactly as each Checkpoint B task specified for its own piece. Re-read the current file in full before starting — it's been touched by every B-task.

**Rethrow vs. record-and-continue, deliberately:** `desktop-dom`, `mobile-dom`, and `seo-extraction` failures are rethrown after being recorded — without a loaded desktop page there's no audit at all. `cta-journey-desktop` failures are recorded but **not** rethrown — a broken conversion-path check shouldn't fail an otherwise-complete audit. Always push `{ id: "cta-journey-mobile", status: "skipped", reason: "single-page audit tests conversion paths once, on desktop, to bound audit runtime" }` (the schema's top-level invariant requires this whenever `mobile.ctaJourneys` is `null`).

- [ ] **Step 2: `process-audit.ts` — assemble, sanitize, validate, persist, clear Buffers**

```ts
import { claimNextAudit, completeAudit, failAudit, saveScan } from "@/lib/db/audits";
import { scanHomepage } from "@/lib/audit/browser-scanner";
import { runLighthouse, buildAutomatedAccessibilityChecks } from "@/lib/audit/lighthouse-scanner";
import { generateReport } from "@/lib/audit/generate-report";
import { uploadCtaScreenshots, uploadCookieBannerScreenshots, uploadScreenshots } from "@/lib/storage/screenshots";
import { AuditEvidenceV2Schema } from "@/lib/audit/evidence-schema";
import { sanitizeEvidenceV2, sanitizeText } from "@/lib/audit/evidence-sanitize";
import { deriveLegacyCtaJourneys } from "@/lib/audit/evidence-legacy";
import type { AuditEvidenceV2, TestExecutionRecord } from "@/lib/audit/evidence-types";

export async function processNextAudit() {
  const audit = await claimNextAudit();
  if (!audit) return null;
  const startedAt = new Date().toISOString();
  try {
    const browserResult = await scanHomepage(audit.normalizedUrl);
    const { metrics, evidence: performanceEvidence, lhr } = await runLighthouse(browserResult.page.url);
    const screenshots = await uploadScreenshots(audit.id, browserResult.desktopScreenshot, browserResult.mobileScreenshot);
    browserResult.page.desktopScreenshotPath = screenshots.desktop;
    browserResult.page.mobileScreenshotPath = screenshots.mobile;

    const ctaScreenshots = await uploadCtaScreenshots(audit.id, browserResult.ctaScreenshots);
    for (const { evidenceId, path } of ctaScreenshots) {
      const journey = browserResult.evidenceParts.desktop.ctaJourneys.find((j) => j.evidenceId === evidenceId);
      if (journey) journey.screenshotRef = path;
    }
    // Legacy ctaJourneys are re-derived AFTER screenshot refs are attached to the v2
    // records — the legacy shape is always a projection of the v2 measurement, matched
    // by evidenceId, never a second independent computation or an index-based join.
    browserResult.page.ctaJourneys = deriveLegacyCtaJourneys(browserResult.evidenceParts.desktop.ctaJourneys);
    // Buffers are no longer needed once uploaded — drop references so nothing
    // downstream could accidentally serialize them into JSON/DB.
    browserResult.ctaScreenshots.forEach((entry) => { (entry as { buffer?: Buffer }).buffer = undefined; });

    const tests: TestExecutionRecord[] = [...browserResult.evidenceParts.tests, { id: "lighthouse-lab", status: "passed" }];
    const cookieUpload = await uploadCookieBannerScreenshots(audit.id, browserResult.cookieBannerScreenshots);
    tests.push(
      cookieUpload.failedStages.length > 0
        ? { id: "cookie-banner-screenshot-upload", status: "failed", reason: sanitizeText(`Upload failed for: ${cookieUpload.failedStages.join(", ")}`, 300) }
        : { id: "cookie-banner-screenshot-upload", status: "passed" },
    );
    browserResult.evidenceParts.desktop.browser.cookieBanner.screenshotBeforeDismiss = cookieUpload.desktop.before;
    browserResult.evidenceParts.desktop.browser.cookieBanner.screenshotAfterDismiss = cookieUpload.desktop.after;
    browserResult.evidenceParts.mobile.browser.cookieBanner.screenshotBeforeDismiss = cookieUpload.mobile.before;
    browserResult.evidenceParts.mobile.browser.cookieBanner.screenshotAfterDismiss = cookieUpload.mobile.after;
    browserResult.cookieBannerScreenshots.desktop.before = undefined;
    browserResult.cookieBannerScreenshots.desktop.after = undefined;
    browserResult.cookieBannerScreenshots.mobile.before = undefined;
    browserResult.cookieBannerScreenshots.mobile.after = undefined;

    const evidenceUnsanitized: AuditEvidenceV2 = {
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
        tool: { lighthouseVersion: performanceEvidence.lab.lighthouseVersion },
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
        desktop: {
          automatedChecks: buildAutomatedAccessibilityChecks(lhr),
          browserObservations: {
            imagesWithoutAlt: browserResult.evidenceParts.desktop.browser.images.filter((img) => !img.hasAlt).length,
            formInputsWithoutLabel: browserResult.evidenceParts.desktop.browser.forms.flatMap((f) => f.inputs).filter((i) => !i.hasLabel).length,
            landmarksPresent: Object.entries(browserResult.evidenceParts.desktop.browser.landmarks).filter(([, present]) => present).map(([key]) => key),
          },
        },
        mobile: {
          automatedChecks: { source: "lighthouse", status: "not-assessed", score: null, failedAudits: [] },
          browserObservations: {
            imagesWithoutAlt: browserResult.evidenceParts.mobile.browser.images.filter((img) => !img.hasAlt).length,
            formInputsWithoutLabel: browserResult.evidenceParts.mobile.browser.forms.flatMap((f) => f.inputs).filter((i) => !i.hasLabel).length,
            landmarksPresent: Object.entries(browserResult.evidenceParts.mobile.browser.landmarks).filter(([, present]) => present).map(([key]) => key),
          },
        },
        requiresHumanVerification: ["keyboard trap testing", "screen reader announcement correctness", "meaningful reading order", "color contrast on non-text UI", "focus order and visibility"],
      },
    };

    const sanitized = sanitizeEvidenceV2(evidenceUnsanitized);
    browserResult.page.evidence = AuditEvidenceV2Schema.parse(sanitized);
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

`AuditEvidenceV2Schema.parse()` throwing (malformed/invariant-violating evidence) is caught by the existing outer `try/catch`, which already calls `failAudit` — no new error-handling branch needed. A `blocked-unsafe-redirect` CTA outcome, by contrast, is a **normal, valid** evidence record (Task B3 never throws for it), so it does **not** reach this catch block at all — the audit completes.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/audit/browser-scanner.ts src/lib/audit/process-audit.ts
git add src/lib/audit/browser-scanner.ts src/lib/audit/process-audit.ts
git commit -m "feat: assemble, sanitize, validate, and persist AuditEvidenceV2 through the worker pipeline"
```

---

### Task C4: Read-path validation

**Files:** Modify `src/lib/db/audits.ts`

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

Wire into both `getAudit()` and `getOwnedAuditFull()` right after `result.page = {...}` is built:

```ts
if (page) {
  result.page = { ...(page.extracted_json as ExtractedPage), desktopScreenshotPath: page.desktop_screenshot_url, mobileScreenshotPath: page.mobile_screenshot_url };
  result.page.evidence = parseEvidence(id, (page.extracted_json as { evidence?: unknown })?.evidence);
}
```

- [ ] Typecheck, lint, commit:

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/lib/db/audits.ts
git add src/lib/db/audits.ts
git commit -m "feat: safe-parse evidence on read, degrade invalid/legacy rows to undefined"
```

---

### Task C5: Report-copy corrections

**Files:** Modify `src/components/report/report-view.tsx`

- [ ] **Step 1: CTA copy gating in `buildWalkthrough()`**

```ts
function buildWalkthrough(page: ExtractedPage): string[] {
  const heading = page.headings.find((h) => h.level === 1)?.text || page.title;
  const steps: string[] = [`I land on the page and the first thing I read is "${heading}."`];
  const foldText = page.aboveFold.text.trim();
  if (foldText) steps.push(`Just below it: "${foldText.slice(0, 150)}${foldText.length > 150 ? "…" : ""}"`);
  if (page.cookieBanner.detected) steps.push("Before I can read further, a cookie consent banner asks me to decide.");

  const evidenceJourneys = page.evidence?.desktop.ctaJourneys;
  if (evidenceJourneys) {
    for (const journey of evidenceJourneys.slice(0, 3)) {
      if (journey.navigationAttempted && (journey.outcome === "navigated" || journey.outcome === "redirected")) {
        steps.push(`I click "${journey.text}" — it ${journey.outcome === "redirected" ? "redirects and loads" : "loads"}.`);
      } else if (journey.outcome === "external-not-visited") {
        steps.push(`I see "${journey.text}" — it points to an external site, not visited in this audit.`);
      } else {
        steps.push(`I see "${journey.text}" — not tested in this audit.`);
      }
    }
  } else {
    for (const journey of page.ctaJourneys.slice(0, 3)) {
      steps.push(journey.sameOrigin ? `I click "${journey.text}" — ${journey.outcome.toLowerCase()}.` : `I click "${journey.text}" — it sends me to an external site.`);
    }
  }
  return steps;
}
```

- [ ] **Step 2: Responsiveness metric label split**

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

Never relabel old `inpOrTbt` data as certain TBT — the legacy branch keeps the honest "source not recorded" framing.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
docker-compose run --rm web npx tsc --noEmit && docker-compose run --rm web npx eslint src/components/report/report-view.tsx
git add src/components/report/report-view.tsx
git commit -m "fix: gate CTA copy on real navigation, split TBT/INP responsiveness label"
```

- [ ] **Checkpoint C self-review:** `raw_lighthouse_json` no longer carries the full LHR; Lighthouse test conditions are read from `lhr.configSettings`, not hardcoded; accessibility evidence is genuinely per-viewport (mobile `automatedChecks.status === "not-assessed"` always, `browserObservations` real on both); CTA screenshot refs are matched by `evidenceId`; Buffers are cleared after upload; legacy fields still derive from v2 evidence only. Fix anything missing before Checkpoint D.

---

## Checkpoint D — Live fixture, SSRF proof, privacy inspection, cleanup

**No plan-time code** — executed live.

- [ ] **Step 1: Full local build gate**

```bash
docker-compose run --rm web npx tsc --noEmit
docker-compose run --rm web npx eslint .
docker-compose run --rm web npm test
docker-compose run --rm web npm run build
```
Revert `next-env.d.ts` if `next build` regenerates it (known benign artifact from prior sprints).

- [ ] **Step 2: Deploy an isolated fixture with real routes**

Build a minimal Next.js (or plain Node) app in a scratch directory — not this repo, no Git linkage — with actual server routes, not static HTML, since a real 302 requires a server response:
- `/` — homepage with distinct desktop/mobile CSS, a real cookie-consent banner + dismiss button, a form with labeled inputs and a form with an unlabeled input, valid JSON-LD plus one malformed block, canonical/robots/hreflang/OG tags, an inline script issuing `console.error(...)` and a `fetch()` to a guaranteed-404 path, and three CTAs: one to `/go/redirect` (same-origin, 302), one to `/go/private` (302 to a private/link-local address), one to an external site.
- `/go/redirect` — a route handler issuing a real `302` to `/thanks`.
- `/go/private` — a route handler issuing a real `302 Location:` header pointing at a private/link-local address (e.g. `http://169.254.169.254/` or `http://10.255.255.1/`).
- `/thanks` — a simple landing page for the redirect target.

Deploy via `vercel deploy` (no `--prod`, no linked Git repo, no env vars, no custom domain) from that scratch directory; record the resulting `*.vercel.app` URL only in a local temp file, never committed.

- [ ] **Step 3: Run a real audit through the actual worker pipeline**

Using the live Docker dev stack, create a real audit against the fixture URL through the legitimate app path (matching whatever the prior sprint's Task 9 protocol used for creating/paying a test audit — no raw SQL), and let `processNextAudit()` run to completion.

- [ ] **Step 4: Verify every invariant and correction live**

Load the completed audit via `getOwnedAuditFull`/`getAudit` (never raw SQL) and confirm:
- Every `CtaJourneyEvidence`/`OverlapCandidate`/`SmallTapTargetCandidate`/console/network/`JsonLdEvidence`/hreflang/OG entry has a non-empty `evidenceId`, and re-running `makeEvidenceId` with the same inputs reproduces the same ids.
- The CTA to `/go/private` has `outcome: "blocked-unsafe-redirect"`, `navigationAttempted: true`, a generic `error` message, and **no private IP address anywhere in the persisted row** (grep the serialized evidence) — and the audit still completed (`status: "completed"`, not `"failed"`). **If the audit failed because of this CTA, stop and document before doing anything else — that is the bug this correction exists to prevent, not an acceptable outcome.**
- The `/go/redirect` CTA has `outcome: "redirected"`, `redirectCount >= 1`, `finalUrl` set.
- `cookieBanner.detected`/`.dismissed` both `true`; `blockingStatus` is `"verified"` with a real boolean `blocking`; before/after screenshot refs are real Storage URLs, not local paths, not Buffers.
- `overlapCandidates`/`smallTapTargetCandidates` entries (if any) have `status: "inferred"`, never `"verified"`, while `overlapCandidatesStatus`/`smallTapTargetCandidatesStatus` (the scan-ran indicator) is `"verified"`.
- `jsonLd` has one `parsed: true` and one `parsed: false` entry; neither contains the raw script; `contentMatchStatus` is `"inferred"` or `"not-assessed"`, never `"verified"`.
- `accessibility.mobile.automatedChecks.status === "not-assessed"` and `score === null`, while `accessibility.desktop.automatedChecks.status === "verified"` with a real score; `accessibility.mobile.browserObservations` has real (non-placeholder) counts from the mobile scan.
- `performance.testConditions` reflects real `lhr.configSettings` values, not hardcoded strings.
- `audit_metrics.raw_lighthouse_json` (inspect via the app's own read path) is the small sanitized subset, not a full Lighthouse result.
- Nothing in the persisted evidence or a rendered report page claims "WCAG compliant" or an automatic conformance level.
- A deliberately-corrupted copy of the persisted evidence, run through `AuditEvidenceV2Schema.safeParse()` in a throwaway script, degrades cleanly (`success: false`, no throw).

- [ ] **Step 5: Regression-check `/audits/demo`**

Via a real browser, confirm `/audits/demo` renders exactly as before — `demoAudit` has no `evidence`, exercising the fallback branches from Task C5.

- [ ] **Step 6: Full cleanup**

In order: delete the audit row (cascades to `audit_pages`/`audit_metrics`/`audit_reports` via the existing `on delete cascade`, through the Supabase admin JS client, not raw SQL) → delete every uploaded Storage object for that audit id (desktop/mobile screenshots, CTA screenshots, cookie-banner before/after screenshots — list the bucket prefix and remove them explicitly) → tear down the throwaway Vercel project (`vercel remove <project> --yes`) → delete the local temp file tracking the fixture URL → confirm `git status` clean, no stray files, no credential/token/fixture-URL committed anywhere.

- [ ] **Step 7: Open the PR**

```bash
git push -u origin feature/evidence-contract-v2
gh pr create --title "Evidence Contract v2 — verifiable, honest audit evidence" --body "..."
```
PR body covers: the evidence contract (types, stable IDs, sanitizer, Zod invariants, legacy derivation), the scanner/pipeline changes, the three approved report-copy corrections, the committed test suite, and the live-fixture verification results (including the SSRF-block proof and the `raw_lighthouse_json` privacy inspection). **Do not merge** — stops here for review.

## Self-review notes

Every correction from this round — stable `evidenceId` on every repeatable record (never array index), `superRefine` invariants (blocking/status pairing, outcome-conditional requirements, field-performance availability, mobile-skip cross-reference, ISO timestamps, HTTP status ranges, positive/non-negative numerics), a whole-object `sanitizeEvidenceV2` ahead of Zod parse, sanitize-before-hash for JSON-LD, a committed `node:test` suite (sanitization, ID determinism/uniqueness, every invariant, legacy derivation, invalid-evidence degradation, id-based CTA↔screenshot mapping, no-Buffer serialization), the `raw_lighthouse_json` privacy fix, `inferred`-not-`verified` semantics for geometric conclusions and JSON-LD content-match, genuinely per-viewport accessibility evidence, `blocked-unsafe-redirect` as a non-fatal typed outcome with no raw private address ever persisted, a screenshot lifecycle with size caps/Buffer-clearing/precise partial-failure reporting/detected-only capture, a real-routes isolated fixture with full Storage cleanup, and real-`configSettings`-sourced performance methodology — has a concrete task above. Type names/fields are used identically across Checkpoints A-D.
