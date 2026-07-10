# Professional Audit Engine v2 — Evidence Contract v2 — Design Spec

**Date:** 2026-07-10
**Status:** Draft, awaiting review

## Goal

Lensiq's report should read like a consulting deliverable: for every claim, a reader can
see what was observed, where, with what method, on which viewport, with what result,
and what the audit's limits were. Today the report is closer to AI opinion with
decoration — evidence is free text, section/overall scores are chosen by the model with
no deterministic grounding, "mobile" analysis silently reuses desktop's extracted data,
a cookie banner counts as "detected" only if it was also successfully dismissed, CTA
"click" language is used even when nothing was navigated, several standard SEO signals
are never captured at all, console/network errors aren't captured at all, and a single
lab metric is displayed under a label that conflates two genuinely different things
(TBT and INP).

This sprint builds the **evidence layer** underneath the report: a versioned,
backward-compatible TypeScript contract for what gets collected, how it's provenanced,
and how it's stored — verified against a controlled fixture. It does not redesign
scoring, prompts, or the report UI, beyond three narrow, explicitly-scoped bug-level
corrections listed in "Report-copy corrections included in this sprint" below — nothing
else in `report-view.tsx`'s layout, sections, or visual design changes.

## Out of scope

New scoring or deterministic score computation. Changes to the 8 expert prompts or the
Executive Reviewer. A redesigned report UI or layout. PDF export or share links.
Multi-page crawling (this remains a single-URL, single-page audit). CrUX/field-data
integration (if it requires new credentials or a separate subproject, it stays
`not-assessed` this sprint). The $29 founder price and its copy. The production worker
process itself changing how it's deployed. Auth, checkout, the Stripe webhook, and legal
pages (all untouched, per the prior sprint's boundary). RLS or any browser-side Supabase
client. No benchmark or competitor references in code, commits, or docs.

## Current state — verified gaps

Read in full: `src/lib/audit/browser-scanner.ts`, `src/lib/audit/lighthouse-scanner.ts`,
`src/lib/audit/types.ts`, `src/lib/audit/generate-report.ts`, `src/lib/audit/experts/*`,
`src/lib/db/audits.ts`, `src/components/report/report-view.tsx`,
`src/lib/audit/process-audit.ts`, `scripts/audit-worker.ts`, and
`supabase/migrations/*.sql`. Confirmed facts that ground every requirement below:

1. **Mobile reuses desktop's extraction wholesale.** `scanHomepage()`
   (`browser-scanner.ts:122-154`) calls `extract(desktopPage)` once. The mobile context
   only navigates (`settle(mobilePage, pageData.url)`, line 146), attempts a cookie
   dismiss whose return value is discarded (line 148), annotates the screenshot with
   **desktop's** CTA labels (`addAnnotations(mobilePage, pageData.ctas)`, line 149), and
   screenshots. `extract(mobilePage)` is never called — there is no mobile-sourced
   headline, above-fold text, CTA list, overflow, form, or landmark data anywhere in the
   system today.
2. **`cookieBanner.detected` and `.dismissed` are always identical.**
   `browser-scanner.ts:131-133` sets both fields from the same boolean —
   `dismissCookieBanner()`'s return value. "Detected" today means "a dismiss click
   succeeded," not "a banner element was observed." A banner that's present but whose
   dismiss button doesn't match any known pattern is indistinguishable from no banner at
   all.
3. **CTA outcome is a free-form string built from four different shapes**
   (`testCtaJourneys`, `browser-scanner.ts:87-105`): `"External destination detected"`,
   `` `Loaded: ${title}` ``, `` `HTTP ${status}` ``, or a truncated exception message.
   Only same-origin CTAs are ever navigated; external ones get a hardcoded string with no
   real check. Only the first 5 CTA candidates are tested — the rest are silently
   dropped, with no "not tested" marker. `report-view.tsx:23` renders `I click "${text}"
   — ${outcome.toLowerCase()}` for **every** same-origin journey regardless of whether
   the underlying outcome was a real success, an HTTP failure, or a caught exception.
4. **Missing SEO extraction entirely:** canonical link, robots meta, X-Robots-Tag
   header, `html[lang]`, viewport meta tag, hreflang, Open Graph, JSON-LD. Confirmed via
   full-repo grep — none of these are extracted from an audited page anywhere in
   `src/lib/audit/`.
5. **No llms.txt handling anywhere** (grepped, zero hits) — good, nothing to remove, but
   the spec below makes the "we don't score this" position explicit and cites why.
6. **`inpOrTbt` conflates two different metrics under one field and one label.**
   `lighthouse-scanner.ts:31`: `inpOrTbt: numeric(audits["interaction-to-next-paint"] ??
   audits["total-blocking-time"])` — whichever Lighthouse audit responds first, with no
   record of which one it was. `report-view.tsx:72` displays it under the literal label
   `"TBT / INP"`. There is no CrUX/field-data integration anywhere (grepped, zero hits).
7. **No console or network capture anywhere.** No `page.on('console'|'pageerror'
   |'requestfailed', ...)` listener exists in the scanning code.
8. **No WCAG version reference anywhere** (grepped, zero hits) and no place claims
   "WCAG compliant" today — nothing to walk back, but nothing to point to either.
9. **`extracted_json` (jsonb, `audit_pages.extracted_json`) already stores the entire
   `ExtractedPage` object verbatim** (`db/audits.ts:88`) and reads reconstruct it with an
   unchecked cast (`{...(page.extracted_json as ExtractedPage)}`, `db/audits.ts:33,73`)
   — no runtime schema validation on read. This is exactly the extension point the "no
   new migration" requirement below relies on.
10. **`ReportView` force-unwraps `audit.report!`/`audit.metrics!`** and reads
    `audit.page?.cookieBanner.detected` without an extra `?.` before `.detected`
    (`report-view.tsx:45-46,61`) — any new required field on `ExtractedPage` must be
    optional, or every pre-this-sprint completed audit and the hand-authored
    `demoAudit` fixture (`src/lib/audit/demo.ts`) breaks at runtime or at compile time.

## Official grounding

Verified against current primary sources (not training-data recall), 2026-07-10:

- **WCAG 2.2** is the current W3C Recommendation (since October 2023), with three
  conformance levels — A (minimum, removes serious barriers), AA (most organizations'
  target), AAA (highest). Source:
  [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/),
  [WCAG 2 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/).
- **INP is fundamentally a field metric.** Google's own guidance: INP *can* be produced
  in a lab run only if interactions are deliberately scripted into the test; Lighthouse's
  standard run (page load only, no scripted interaction — which is exactly what
  `runLighthouse()` does) cannot reliably produce it. "Total Blocking Time (TBT) may be
  a reasonable proxy metric for INP, but it's not a substitute for INP in and of
  itself." The 75th-percentile pass/fail judgment is always field data (CrUX), never a
  lab number. Thresholds: LCP good <2.5s, INP good <200ms, CLS good <0.1. Source:
  [web.dev — INP](https://web.dev/articles/inp).
- **No AI-specific markup is required or rewarded by Google Search**, including AI
  Overviews/AI Mode: *"You don't need to create new machine readable files, AI text
  files, markup, or Markdown to appear in Google Search."* `llms.txt` files "will
  neither harm nor help" visibility — Google Search doesn't use them. This is an
  explicit June 2026 Search Central clarification. Source:
  [Google — Optimizing for Generative AI Features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
  This directly grounds the "don't score llms.txt, don't promise AI-results presence"
  requirement below.

## Architecture

### Report-copy corrections included in this sprint

Everything else in `report-view.tsx` is untouched. Exactly three narrow, bug-level
fixes are in scope, each because it's called out by name in the required checks below —
not as a first step toward a redesign:

1. **Cookie banner** — `ExtractedPage.cookieBanner` keeps its existing shape
   (`{ detected: boolean; dismissed: boolean }`), so `report-view.tsx:61`
   (`audit.page?.cookieBanner.detected`) needs no code change at all. Only the
   *computation* feeding those two fields is corrected (see below) — `detected` no
   longer silently equals `dismissed`.
2. **CTA copy gating** — `buildWalkthrough()` (`report-view.tsx:16-26`) is corrected so
   verified-action phrasing ("I click… it loads…") is only used when the underlying
   journey was actually navigated; every other case renders observation-of-non-action
   language instead (exact rule under "CTA journeys" below). This is a one-condition
   fix to existing copy-generation logic, not new UI. It sources from
   `page.evidence?.desktop.ctaJourneys` when present; for pre-sprint audits (`evidence`
   `undefined`), `buildWalkthrough()` falls back to today's exact behavior against the
   legacy `page.ctaJourneys` — no regression for existing completed audits or
   `demoAudit`.
3. **TBT/INP label** — the single `"TBT / INP"` row at `report-view.tsx:72` becomes two
   rows: lab TBT (captioned "lab proxy") and field INP (reading "Not assessed" this
   sprint). No other row, section, or layout in `report-view.tsx` changes.

### Evidence Contract types (new file: `src/lib/audit/evidence-types.ts`)

A new, additive, optional `evidence` field is added to the existing `ExtractedPage`
type. It round-trips through the existing `audit_pages.extracted_json` jsonb column with
**no migration** — old rows simply have `evidence: undefined`, which every consumer
must treat as "this audit predates the Evidence Contract," not as an error.

```ts
export type EvidenceSource = "dom" | "screenshot" | "cta-journey" | "lighthouse" | "network" | "console" | "metadata";
export type EvidenceStatus = "verified" | "inferred" | "not-assessed";

// Used where provenance/confidence genuinely varies (CTA outcomes, cookie-banner
// blocking determination, JSON-LD/visible-content matching, console/network entries).
// Deterministic DOM facts that are always either present-and-observed or cleanly
// absent (canonical tag text, html[lang], a meta tag's raw content) don't need the
// envelope — a plain nullable field already says everything there is to say.
export interface EvidenceItem<T = unknown> {
  id: string;          // stable, dot-path style: "seo.canonical", "cta.2.outcome", "cookieBanner.blocking"
  source: EvidenceSource;
  url: string;
  viewport: "desktop" | "mobile";
  timestamp: string;   // ISO 8601, captured at observation time
  description: string; // human-readable, e.g. "Canonical link tag value"
  selector?: string;
  value: T;
  screenshotRef?: string;
  status: EvidenceStatus;
}

export interface AuditMethodology {
  contractVersion: 2;
  startedAt: string;   // ISO 8601
  finishedAt: string;
  requestedUrl: string;
  finalUrl: string;
  pageGoal: string;
  scope: "single-page";
  viewports: { desktop: { width: number; height: number }; mobile: { width: number; height: number } };
  userAgent: { desktop: string; mobile: string };
  tool: { lighthouseVersion: string };
  redirects: { from: string; to: string; status: number }[];
  testsRun: string[];
  testsSkipped: { test: string; reason: string }[];
  testsFailed: { test: string; reason: string }[];
  limitations: string[]; // e.g. "single page only, not a site-wide crawl"; "field performance data not assessed — no CrUX integration this release"
}
```

### Browser evidence — independent per viewport

`extract()` (`browser-scanner.ts`) runs **once per viewport**, against that viewport's
own `Page`, producing a full `BrowserEvidence` record for each. `testCtaJourneys` stays
desktop-only for cost/runtime reasons (re-clicking the same conversion paths twice
doesn't add evidentiary value for a single-page audit) — this is recorded explicitly as
a skipped test, not silently dropped:

```ts
export interface BrowserEvidence {
  viewport: "desktop" | "mobile";
  headline: string | null;
  headingHierarchy: { level: number; text: string }[];
  aboveFold: { text: string; ctaTexts: string[]; imageCount: number };
  ctasVisible: { text: string; href: string; tag: string; position: "above-fold" | "below-fold" }[];
  navPresent: boolean;
  hasHorizontalOverflow: boolean;
  cutoffOrOverlappingElements: { selector: string; issue: "cutoff" | "overlapping" }[];
  problematicTapTargets: { selector: string; widthPx: number; heightPx: number; reason: string }[]; // mobile only; [] on desktop
  forms: { action: string; inputs: { name: string; type: string; hasLabel: boolean }[] }[];
  landmarks: { hasNav: boolean; hasFooter: boolean; hasMain: boolean };
  images: { src: string; hasAlt: boolean; aboveFold: boolean }[];
  cookieBanner: CookieBannerEvidence;
}

export interface ViewportEvidence {
  browser: BrowserEvidence;
  console: ConsoleNetworkEvidence;
  ctaJourneys: CtaJourneyEvidence[] | null; // null on mobile — see methodology.testsSkipped
}
```

`domSummary` and `trustSignals` (existing `ExtractedPage` fields) are unaffected and stay
desktop-only as they are today — they're diagnostic counts, not part of this contract.

### Cookie banner — detection and dismissal as independent facts

```ts
export interface CookieBannerEvidence {
  detected: boolean;          // a banner-shaped element was observed in the DOM, independent of dismiss outcome
  dismissAttempted: boolean;
  dismissed: boolean;
  blocking: boolean;          // see determination rule below — never inferred from "we couldn't click a button"
  buttonsFound: string[];     // matched button/link texts
  screenshotBeforeDismiss?: string;
  screenshotAfterDismiss?: string;
}
```

`dismissCookieBanner()` is split into a **detect** step (broadened pattern match against
banner-shaped containers, independent of any click) and a **dismiss** step (today's
click logic). `blocking` is set to `true` only on a concrete structural check — the
detected banner element covers a large majority of the viewport with
`position: fixed|sticky` and a stacking context above page content, or the page's own
scroll/interaction is locked (e.g. `body` has `overflow: hidden` while the banner is
present) — recorded as its own `EvidenceItem` (`source: "dom"`) so the report can cite
exactly what was measured, not asserted. If that structural check can't run for some
reason, `blocking` defaults to `false`, never to an assumption.

One detect/dismiss operation, two persisted views: the legacy
`ExtractedPage.cookieBanner: { detected, dismissed }` and the new, richer
`evidence.desktop.browser.cookieBanner: CookieBannerEvidence` are populated from the
same underlying detect-then-dismiss call, not two separate checks — `detected`/
`dismissed` mean the identical thing in both places, the new structure just carries the
additional fields the legacy one has no room for.

### CTA journeys — typed outcome, no unverified "clicked" language

```ts
export type CtaOutcome = "navigated" | "redirected" | "http-error" | "network-error" | "external-not-visited" | "skipped-limit" | "skipped-invalid-url";

export interface CtaJourneyEvidence {
  text: string;
  element: string;          // tag/role, e.g. "a", "button"
  declaredUrl: string;      // as found in href, before resolution
  sameOrigin: boolean;
  navigationAttempted: boolean;
  finalUrl?: string;
  redirectCount?: number;
  httpStatus?: number;
  outcome: CtaOutcome;
  screenshotRef?: string;
  error?: string;
  skippedReason?: string;   // required whenever navigationAttempted === false
}
```

Redirect count is derived by walking Playwright's `request.redirectedFrom()` chain on
the final response back to `null`. Every hop in that chain — same-origin or not — is
re-validated with `assertSafeUrl`/`resolveSafeHostAddress` before the navigation is
allowed to proceed, closing the gap where only the pre-navigation and final URLs were
checked.

The legacy `ExtractedPage.ctaJourneys: { text, destination, outcome: string, sameOrigin
}[]` field is kept, populated exactly as it is today (same free-text `outcome`), purely
so any code still reading it directly is unaffected. It is not the input to the CTA
copy-gating fix — that fix (item 2 under "Report-copy corrections included in this
sprint") sources from the new, typed `evidence.desktop.ctaJourneys: CtaJourneyEvidence[]`
instead. **Rule:** verified-action language ("I click… it loads…") may only be used
when `navigationAttempted === true` and `outcome` is `"navigated"` or `"redirected"`.
Every other outcome must render as observation-of-non-action language ("This CTA points
to an external site — not visited in this audit," "Not tested — audit is capped at the
first 5 conversion paths").

### SEO evidence

```ts
export interface SeoEvidence {
  title: string;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;      // from the main navigation response headers
  htmlLang: string | null;
  viewportMeta: string | null;
  headings: { level: number; text: string }[];
  hreflang: { lang: string; href: string }[];
  openGraph: { property: string; content: string }[];
  jsonLd: { raw: string; parsed: boolean; types: string[]; parseError?: string; contentMatch: EvidenceItem<boolean> | null }[];
  links: { text: string; href: string; sameOrigin: boolean }[];
  pageStatus: { initialStatus: number | null; finalStatus: number | null; redirectChain: { from: string; to: string; status: number }[] };
}
```

`xRobotsTag` and `pageStatus` require the primary navigation's `Response` object, which
today's `settle()` helper doesn't currently surface — it will be extended to return it.
`jsonLd[].contentMatch` is computed only for the schema.org types where a cheap,
deterministic substring check against `visibleText` is meaningful (e.g. `Product.name`,
`Article.headline`); every other type gets `contentMatch: null` (not a guess). No
llms.txt evidence is collected and no score references it, per the grounding above —
Google Search does not use it, so treating its absence or presence as signal would be
inventing a check nobody asked for.

### Performance evidence — lab and field kept structurally separate

```ts
export interface PerformanceEvidence {
  lab: { lcp: number | null; cls: number | null; tbt: number | null; ttfb: number | null; source: "lighthouse"; lighthouseVersion: string };
  field: { lcp: EvidenceStatus; cls: EvidenceStatus; inp: EvidenceStatus; source: "not-integrated" };
  testConditions: { runAt: string };
}
```

`field.*` is always `"not-assessed"` this sprint — no CrUX integration (out of scope).
`AuditMetrics.inpOrTbt` (the existing DB column, `audit_metrics.inp_or_tbt`) is
**unchanged** for backward compatibility with existing rows and the worker/report
consumers that read it today. The new `PerformanceEvidence.lab.tbt` is sourced from
Lighthouse's `total-blocking-time` audit specifically (never `interaction-to-next-paint`
— that value, when Lighthouse does produce one from an unscripted run, is not reliable
enough to label as INP and is dropped, not stored). This sprint's one permitted,
surgical report-UI change (explicitly required by the final criteria below): the
`"TBT / INP"` label at `report-view.tsx:72` is split into two rows — a lab TBT value
with a "lab proxy" caption, and a field INP row that reads "Not assessed — requires
real-user data" when `field.inp === "not-assessed"`. No other report layout changes.

### Accessibility evidence

```ts
export interface AccessibilityEvidence {
  standard: "WCAG 2.2";
  automatedChecks: { source: "lighthouse"; score: number; failedAudits: { id: string; title: string; impact?: string }[] };
  browserObservations: { imagesWithoutAlt: number; formInputsWithoutLabel: number; landmarksPresent: string[] };
  requiresHumanVerification: string[]; // fixed, non-generated list: e.g. "keyboard trap testing", "screen reader announcement correctness", "meaningful reading order", "color contrast on non-text UI"
}
```

Nothing in the report may say "WCAG compliant." Any accessibility copy must state the
standard referenced (WCAG 2.2), that checks are automated-plus-browser-heuristic, and
that the `requiresHumanVerification` list was not checked.

### Console and network evidence

```ts
export interface ConsoleNetworkEvidence {
  consoleErrors: { message: string; timestamp: string }[];
  pageErrors: { message: string; timestamp: string }[];
  failedRequests: { url: string; resourceType: string; domain: string; status: number | null; message?: string }[];
  limits: { maxConsoleErrors: number; maxFailedRequests: number; truncated: boolean };
}
```

Captured via `page.on("console")` (filtered to `type() === "error"`), `page.on(
"pageerror")`, and `page.on("requestfailed")` plus non-2xx/3xx checks on completed
responses, for the same navigation window already used for extraction, per viewport
(a script error can be viewport-specific). Deduplicated by message text, capped (e.g. 20
entries each), URLs stripped of query parameters matching sensitive-looking keys
(`token`, `password`, `key`, `email`, `session`, `auth`), no request/response bodies
ever captured.

## Security and privacy

- Every redirect hop — page-level and CTA-level — is re-validated with the existing
  `assertSafeUrl`/`resolveSafeHostAddress` SSRF guards before being followed. No new
  navigation point in this sprint bypasses them.
- No authenticated/private pages are ever audited (unchanged — out of scope to alter).
- No form values are read, only field `name`/`type`/label-presence.
- No cookies, tokens, or authorization headers are ever captured into evidence, logs, or
  the report — this extends the existing `raw` Lighthouse JSON stripping
  (`generate-report.ts:12`) to every new evidence field before it reaches an AI prompt.
- All arrays are capped and strings truncated **before** anything is sent to an AI
  expert, matching the existing pattern.
- Every string collected from the audited page — console messages, JSON-LD content,
  link text, form field names — is untrusted data, never instructions, exactly like the
  existing `commonRules` framing in `experts/shared.ts:3`. This framing is extended
  explicitly to cover the new evidence fields when they're eventually wired into expert
  prompts (a later sprint, not this one).

## Persistence and backward compatibility

- **No new migration.** `ExtractedPage.evidence?: AuditEvidenceV2` is optional and
  serializes through the existing `audit_pages.extracted_json` jsonb column exactly like
  every other `ExtractedPage` field does today (`db/audits.ts:88`).
- `AuditEvidenceV2` wraps the above pieces:
  ```ts
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
- Every consumer (`ReportView`, any future code) must treat `page.evidence` as
  optional and gate new rendering on its presence. Audits completed before this sprint,
  and the hand-authored `demoAudit` fixture, keep rendering exactly as they do today —
  `/audits/demo` is not required to gain v2 evidence as part of this sprint.
- `getAudit`/`getOwnedAuditFull`'s existing unchecked cast
  (`{...(page.extracted_json as ExtractedPage)}`) is unaffected; `evidence` being
  `undefined` on old rows is exactly what "optional field, no migration" means at
  runtime — no parsing/versioning shim is needed beyond checking for its presence.
- `auditDataIsInconsistent()` (`src/lib/audit/consistency.ts`) is unchanged — it gates
  on `report`/`metrics` presence, which this sprint doesn't touch.

## Worker pipeline integration

New collection steps slot into `scanHomepage()` (`browser-scanner.ts`, for
Playwright/DOM-derived evidence — the per-viewport `extract()` calls, cookie banner
detect/dismiss split, console/network listeners) and into `PerformanceEvidence`
assembly alongside the existing `runLighthouse()` call in `process-audit.ts`. The
methodology record (`startedAt`/`finishedAt`/redirects/tests run-skipped-failed) is
assembled by `processNextAudit()` itself, since it's the only place that sees the whole
run. `saveScan()` persists the assembled `AuditEvidenceV2` as part of the `page` object
it already upserts into `extracted_json` — no signature change beyond `ExtractedPage`
gaining the optional field.

## Testing plan — controlled fixture

A single-page, static fixture (self-hosted or a URL the user explicitly authorizes for
live testing — no production/third-party targets) deliberately includes:

- Different desktop/mobile layouts (so independent extraction is actually exercised,
  not coincidentally identical).
- A detectable cookie banner with a real dismiss control.
- One same-origin CTA that redirects at least once.
- One external CTA that must be recorded as `external-not-visited`, never navigated.
- canonical, robots meta, hreflang, and valid JSON-LD (plus one intentionally malformed
  JSON-LD block, to exercise `parsed: false`/`parseError`).
- A deliberate console error and a deliberately failing network request (e.g. a 404
  sub-resource).
- One form with labeled inputs and one form with an unlabeled input.

**Final criteria:**
- Extracted evidence matches the fixture's known, deliberately-built content.
- No sensitive data (form values, cookies, tokens, headers) is ever persisted.
- Lab TBT and field INP are structurally and visibly separate — never combined into one
  field or one label.
- `cookieBanner.detected` and `.dismissed` can independently be `true`/`false` — verified
  against the fixture's real banner.
- `/audits/demo` and the existing status/report endpoints are unaffected — regression
  check against the current (pre-this-sprint) behavior.
- `typecheck`, `lint`, `build` all pass.
- A real audit run against the authorized fixture URL, executed through the actual
  worker pipeline (not a mocked unit test), produces a persisted `AuditEvidenceV2`
  record matching the criteria above.
- Full cleanup of any test audit rows/fixtures created during verification.
