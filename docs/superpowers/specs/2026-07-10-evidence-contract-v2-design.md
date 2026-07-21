# Professional Audit Engine v2 — Evidence Contract v2 — Design Spec

**Date:** 2026-07-10
**Status:** Draft, revised after first review round, awaiting second review

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
backward-compatible, runtime-validated TypeScript contract for what gets collected, how
it's provenanced, and how it's stored — verified against a controlled fixture. It does
not redesign scoring, prompts, or the report UI, beyond three narrow, explicitly-scoped
bug-level corrections listed in "Report-copy corrections included in this sprint" below.

**Governing principle, binding on every field defined below:** the absence of a
measurement is never represented as a negative or false result. A check that cannot run,
or a signal that isn't integrated yet, is `null` with an explicit `"not-assessed"` (or
`"skipped"`/`"failed"`) status next to it — never silently coerced to `false`, `0`, or
omitted. Saying "not assessed" honestly is the entire point of this sprint; every
correction below follows from this one rule.

## Out of scope

New scoring or deterministic score computation. Changes to the 8 expert prompts or the
Executive Reviewer. A redesigned report UI or layout. PDF export or share links.
Multi-page crawling (this remains a single-URL, single-page audit). CrUX/field-data
integration (if it requires new credentials or a separate subproject, it stays
`not-assessed` this sprint — the contract is shaped so adding it later is additive, see
Performance evidence). The $29 founder price and its copy. The production worker
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
   new migration" requirement below relies on, and exactly the gap the new Zod
   validation (below) closes.
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
- **SC 2.5.8 Target Size (Minimum), Level AA** requires a 24×24 CSS px minimum target
  size, with five explicit exceptions (spacing, equivalent control available, inline
  text targets, user-agent-controlled size, essential/legally-required presentation).
  This is exactly why a geometric bounding-box check can only ever produce *candidates*
  — a small element can legitimately satisfy an exception a pure size measurement can't
  see. Source:
  [W3C — Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
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

## Preflight confirmation (auth production)

Covered fully in the prior turn's work, confirmed here for the written record: no
credential, access token, session password, or test-user data was committed at any
point — the pulled production env file and the credentials file were both created
outside git (gitignored `.env*` patterns) and deleted within the same command chain
that created them; git history and the current working tree contain neither. The one
raw-SQL exception used for cleanup (a single id-scoped `SELECT` then `DELETE` against
the fixture auth user, shown before running) is recorded as strictly incident-specific
in project memory and is not a standing permission — the no-raw-SQL rule for this
sprint's implementation stands as written below with no exception. The temporary
production user and its cascaded `public.users` row were deleted and reconfirmed at
zero rows for that id; the database is clean.

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
   language instead (exact rule under "CTA journeys" below). It sources from
   `page.evidence?.desktop.ctaJourneys` when present; for pre-sprint audits (`evidence`
   `undefined`), `buildWalkthrough()` falls back to today's exact behavior against the
   legacy `page.ctaJourneys` — no regression for existing completed audits or
   `demoAudit`.
3. **Responsiveness metric label** — replaces the single `"TBT / INP"` row at
   `report-view.tsx:72`. For audits with `page.evidence` present: two rows, lab TBT
   (captioned "lab proxy") and field INP (reading "Not assessed" while
   `field.status === "not-assessed"`). For pre-sprint audits (no `evidence`): a single
   row labeled **"Legacy responsiveness metric — source not recorded"**, still backed by
   `metrics.inpOrTbt` — because that column's pre-sprint values were written by the old
   `?? "total-blocking-time"` fallback and we genuinely don't know, for those historical
   rows, whether a given value is TBT or an unscripted INP reading. Claiming it's
   definitely TBT would repeat exactly the mistake this sprint exists to fix. Going
   forward, `runLighthouse()`'s `inpOrTbt` computation is itself corrected to always
   read `total-blocking-time` specifically (dropping the `??` fallback to
   `interaction-to-next-paint`), so for every audit completed *after* this sprint,
   `audit_metrics.inp_or_tbt` and `evidence.performance.lab.tbt` are the same
   single-sourced value — this is the one small, clearly-justified correction to
   existing Lighthouse-scanner code included in this sprint, not a new column.

### Evidence Contract types (new file: `src/lib/audit/evidence-types.ts`)

A new, additive, optional `evidence` field is added to the existing `ExtractedPage`
type. It round-trips through the existing `audit_pages.extracted_json` jsonb column with
**no migration** — old rows simply have `evidence: undefined`, which every consumer
must treat as "this audit predates the Evidence Contract," not as an error.

```ts
export type EvidenceStatus = "verified" | "inferred" | "not-assessed";
```

There is no generic `EvidenceItem<T>` wrapper in this design — an earlier draft proposed
one, but every concrete field below turned out to need either a plain deterministic
value (present or cleanly absent, no ambiguity) or a `value | null` paired with its own
`...Status: EvidenceStatus` sibling field. Standardizing on the sibling-field pattern
directly on each type is simpler than a generic envelope and makes the "never coerce
not-assessed to false" rule visible at every call site that sets these fields. The JSON
path to a field (e.g. `evidence.desktop.browser.cookieBanner.blocking`) serves as its
own stable identifier — no separate `id` string is needed.

```ts
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
  tests: TestExecutionRecord[];
  limitations: string[]; // e.g. "single page only, not a site-wide crawl"; "field performance data not assessed — no CrUX integration this release"
}

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
  reason?: string; // required whenever status !== "passed"; always passed through the central sanitizer before persistence, even for our own fixed internal strings
}
```

`testsRun`/`testsSkipped`/`testsFailed` as bare `string[]` (the first draft's shape) is
replaced by this single typed array — free-text test names can't be validated, can't be
exhaustively enumerated in a Zod schema, and can't be reliably matched against later
(e.g. "did `cta-journey-mobile` run, and if not, why" is a lookup, not a string
comparison). `cta-journey-mobile` is always recorded as `{ id: "cta-journey-mobile",
status: "skipped", reason: "single-page audit tests conversion paths once, on desktop,
to bound audit runtime" }` — a real record, not a silent gap.

### Browser evidence — independent per viewport

`extract()` (`browser-scanner.ts`) runs **once per viewport**, against that viewport's
own `Page`, producing a full `BrowserEvidence` record for each. `testCtaJourneys` stays
desktop-only for cost/runtime reasons (re-clicking the same conversion paths twice
doesn't add evidentiary value for a single-page audit) — recorded via the
`cta-journey-mobile` skip above, not silently dropped.

```ts
export interface OverlapCandidate {
  selector: string;
  overlapsWithSelector: string;
  issue: "cutoff" | "overlap";
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface SmallTapTargetCandidate {
  selector: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  widthPx: number;
  heightPx: number;
}

export interface BrowserEvidence {
  viewport: "desktop" | "mobile";
  headline: string | null;
  headingHierarchy: { level: number; text: string }[];
  aboveFold: { text: string; ctaTexts: string[]; imageCount: number };
  ctasVisible: { text: string; href: string; tag: string; position: "above-fold" | "below-fold" }[];
  navPresent: boolean;
  hasHorizontalOverflow: boolean | null;  // null, never false, when the measurement itself couldn't run
  overlapCandidates: OverlapCandidate[] | null;       // null = check didn't run; [] = ran, found none
  overlapCandidatesStatus: EvidenceStatus;
  smallTapTargetCandidates: SmallTapTargetCandidate[] | null; // mobile only by design
  smallTapTargetCandidatesStatus: EvidenceStatus; // "not-assessed" on desktop (deliberately not checked there), "verified" on mobile when the check runs
  forms: { action: string; inputs: { name: string; type: string; hasLabel: boolean }[] }[];
  landmarks: { hasNav: boolean; hasFooter: boolean; hasMain: boolean };
  images: { src: string; hasAlt: boolean; aboveFold: boolean }[];
  cookieBanner: CookieBannerEvidence;
}

export interface ViewportEvidence {
  browser: BrowserEvidence;
  console: ConsoleNetworkEvidence;
  ctaJourneys: CtaJourneyEvidence[] | null; // null on mobile — see the cta-journey-mobile skip record
}
```

**Overlap/cutoff and small-tap-target candidates are named, typed, and reported as
candidates, not findings.** The scanner can only measure geometry — bounding boxes,
element dimensions, overflow, and geometric overlap between elements. It cannot know
whether an overlay is intentional (a deliberately fixed header, a modal meant to cover
content) or whether a small element qualifies for one of SC 2.5.8's five exceptions
(spacing, equivalent control, inline text, user-agent-controlled, essential/legal). So
the scanner never asserts "this is a UX bug" or "this violates WCAG" — it reports
`overlapCandidates`/`smallTapTargetCandidates` as raw geometric facts with their own
`...Status`, and it is the *expert/report layer* (unchanged this sprint — a future
sprint's job) that judges whether a given candidate is actually a problem. `domSummary`
and `trustSignals` (existing `ExtractedPage` fields) are unaffected and stay
desktop-only as they are today — they're diagnostic counts, not part of this contract.

### Cookie banner — detection and dismissal as independent facts

```ts
export interface CookieBannerEvidence {
  detected: boolean;
  dismissAttempted: boolean;
  dismissed: boolean;
  blocking: boolean | null;     // null, never false, when the structural check couldn't run
  blockingStatus: EvidenceStatus;
  buttonsFound: string[];
  screenshotBeforeDismiss?: string; // populated only after successful upload — see Cookie screenshot lifecycle
  screenshotAfterDismiss?: string;
}
```

`dismissCookieBanner()` is split into a **detect** step (broadened pattern match against
banner-shaped containers, independent of any click) and a **dismiss** step (today's
click logic). `blocking` is set to `true`/`false` (with `blockingStatus: "verified"`)
only on a concrete structural check — the detected banner element covers a large
majority of the viewport with `position: fixed|sticky` and a stacking context above
page content, or the page's own scroll/interaction is locked (e.g. `body` has
`overflow: hidden` while the banner is present). If that structural check throws or
can't run, `blocking` is `null` and `blockingStatus` is `"not-assessed"` — never `false`.

**Single source of truth:** the legacy `ExtractedPage.cookieBanner: { detected,
dismissed }` field is not computed by a second, independent piece of logic — it is a
pure derivation, `deriveLegacyCookieBanner(evidence: CookieBannerEvidence) => { detected:
evidence.detected, dismissed: evidence.dismissed }`, applied after the one real
detect/dismiss pass. One measurement, one mapping function, two shapes — never two
measurements that could drift apart.

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
  error?: string;           // sanitized before persistence — see Centralized sanitization
  skippedReason?: string;   // required whenever navigationAttempted === false; sanitized
}
```

Redirect count is derived by walking Playwright's `request.redirectedFrom()` chain on
the final response back to `null`. **Every hop in that chain — same-origin or not — is
re-validated with `assertSafeUrl`/`resolveSafeHostAddress` before the navigation is
allowed to proceed**, closing the gap where only the pre-navigation and final URLs were
checked; the fixture's redirect-to-a-private-address case (see Testing plan) exists
specifically to prove this per-hop revalidation, not just entry-URL validation.

**Single source of truth:** the legacy `ExtractedPage.ctaJourneys: { text, destination,
outcome: string, sameOrigin }[]` field is likewise a pure derivation,
`deriveLegacyCtaJourneys(evidence: CtaJourneyEvidence[])`, mapping each typed
`CtaOutcome` + `httpStatus`/`finalUrl`/`error` back to the same free-text shape old
readers expect (e.g. `"navigated"` → `` `Loaded: ${finalUrl}` ``, `"http-error"` →
`` `HTTP ${httpStatus}` ``, `"external-not-visited"` → `"External destination
detected"`) — not a second click-through pass. **Rule (used by the CTA copy-gating fix
above):** verified-action language ("I click… it loads…") may only be used when
`navigationAttempted === true` and `outcome` is `"navigated"` or `"redirected"`. Every
other outcome must render as observation-of-non-action language ("This CTA points to an
external site — not visited in this audit," "Not tested — audit is capped at the first
5 conversion paths").

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
  jsonLd: {
    parsed: boolean;
    types: string[];
    parseError?: string;          // sanitized
    excerptHash: string;          // sha256 of the raw script text — for dedup/debugging only, never reversible to content
    sanitizedExcerpt?: string;    // short, sanitized, truncated — only when needed for contentMatch; never the full script
    contentMatch: boolean | null; // null, never false, when not computed for this schema type
    contentMatchStatus: EvidenceStatus;
  }[];
  links: { text: string; href: string; sameOrigin: boolean }[];
  pageStatus: { initialStatus: number | null; finalStatus: number | null; redirectChain: { from: string; to: string; status: number }[] };
}
```

`xRobotsTag` and `pageStatus` require the primary navigation's `Response` object, which
today's `settle()` helper doesn't currently surface — it will be extended to return it.
`jsonLd[].contentMatch` is computed only for the schema.org types where a cheap,
deterministic substring check against `visibleText` is meaningful (e.g. `Product.name`,
`Article.headline`); every other type gets `contentMatch: null,
contentMatchStatus: "not-assessed"`. **The full JSON-LD script text is never stored** —
only its parse outcome, declared types, an irreversible hash for dedup, and — only when
a check genuinely needs a fragment of the content — a short sanitized excerpt, never the
raw block. No llms.txt evidence is collected and no score references it, per the
grounding above — Google Search does not use it, so treating its absence or presence as
signal would be inventing a check nobody asked for.

### Performance evidence — lab and field kept structurally separate, field shape future-compatible

```ts
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
    limitations: string[]; // e.g. "single lab run — not averaged across executions"
  };
}
```

This sprint: `field.source: "not-integrated"`, `field.status: "not-assessed"`,
`percentile`/`periodDays`/`lcp`/`cls`/`inp` all `null`. The shape is deliberately
CrUX-ready — a future integration flips `source` to `"crux"`, `status` to
`"available"`/`"insufficient-data"`, and populates `percentile`/`periodDays`/the three
values, with no contract change. `lab.tbt` is sourced specifically from Lighthouse's
`total-blocking-time` audit (never `interaction-to-next-paint` — see the label
correction above for why). `testConditions` records exactly what a real lab run
happened under (today: one run, no explicit throttling override beyond Lighthouse's
own defaults, desktop form factor for the shared lab pass), including the "single lab
run" limitation whenever `runCount === 1`.

### Accessibility evidence

```ts
export interface AccessibilityEvidence {
  standard: "WCAG 2.2";
  automatedChecks: { source: "lighthouse"; score: number; failedAudits: { id: string; title: string; impact?: string }[] };
  browserObservations: { imagesWithoutAlt: number; formInputsWithoutLabel: number; landmarksPresent: string[] };
  requiresHumanVerification: string[]; // fixed, non-generated list: e.g. "keyboard trap testing", "screen reader announcement correctness", "meaningful reading order", "color contrast on non-text UI"
}
```

`AccessibilityEvidence` is a single, top-level record (like `SeoEvidence` and
`PerformanceEvidence`), sourced from the desktop pass — matching today's single
Lighthouse run and avoiding inventing a second, mobile-specific accessibility score this
sprint. `browserObservations` reads from `desktop.browser.images`/`.forms`, not a
combination of both viewports.

Nothing in the report may say "WCAG compliant," and nothing may attribute a conformance
**level** (A/AA/AAA) automatically — there is deliberately no `level` field in this
contract. A Lighthouse `accessibilityScore` is an automated-checks score, not a
conformance judgment. `smallTapTargetCandidates` (browser evidence, above) are exactly
that — candidates SC 2.5.8 might apply to, not certified violations, since the
geometric check can't evaluate any of the five exceptions. Any accessibility copy must
use language equivalent to **"automated and browser-observed checks against selected
WCAG 2.2 criteria"**, name the standard referenced, and state that the
`requiresHumanVerification` list was not checked.

### Console and network evidence

```ts
export interface ConsoleNetworkEvidence {
  consoleErrors: { message: string; timestamp: string }[];   // message sanitized — see Centralized sanitization
  pageErrors: { message: string; timestamp: string }[];      // sanitized
  failedRequests: { url: string; resourceType: string; domain: string; status: number | null; message?: string }[]; // url and message sanitized
  limits: { maxConsoleErrors: number; maxFailedRequests: number; truncated: boolean };
}
```

Captured via `page.on("console")` (filtered to `type() === "error"`), `page.on(
"pageerror")`, and `page.on("requestfailed")` plus non-2xx/3xx checks on completed
responses, for the same navigation window already used for extraction, per viewport
(a script error can be viewport-specific). Deduplicated by (sanitized) message text,
capped (e.g. 20 entries each). No request/response bodies are ever captured.

### Centralized sanitization

Stripping query params by sensitive-looking key name (the first draft's approach) isn't
enough — a single shared, testable sanitizer is used by every evidence path that
touches page-originated strings. New file: `src/lib/audit/evidence-sanitize.ts`.
`sanitizeUrl` is applied to **every** URL field in the contract, not only error-adjacent
ones — `CtaJourneyEvidence.declaredUrl`/`.finalUrl`, `AuditMethodology.redirects[].from`/
`.to`, `SeoEvidence.pageStatus.redirectChain[].from`/`.to`, and
`ConsoleNetworkEvidence.failedRequests[].url` all go through it, so a redirect chain is
still evidentially useful (it shows the path and host of each hop) without ever
persisting a query string or fragment verbatim. `sanitizeText` covers every
`reason`/`error`/`message` field.

```ts
export function sanitizeUrl(raw: string): string;   // strips fragment always; replaces a non-empty query string with a fixed "?[redacted]" marker by default (not a sensitive-key allowlist); truncates an overlong path
export function sanitizeText(raw: string, maxLength: number): string; // redacts emails, JWTs (three dot-separated base64url segments), "Bearer <token>", common API-key prefixes/shapes, UUIDs, and generic long hash/token-like sequences; truncates to maxLength
```

Every `reason`/`error`/`message` field in this contract — including
`TestExecutionRecord.reason`, even for our own fixed internal strings — is passed
through `sanitizeText` before persistence, and every URL field through `sanitizeUrl`.
This is defense in depth as much as it is redaction: a caught exception's message could
easily embed part of the URL it failed on, a query string, or a token if the audited
page's own error handling leaks one.

### Runtime validation (Zod)

A versioned contract can't rely on TypeScript interfaces and an unchecked JSONB cast
alone — types disappear at runtime, and a bug in the scanner could otherwise persist
malformed or oversized evidence with nothing catching it before or after the write. New
file: `src/lib/audit/evidence-schema.ts`, mirroring every interface in
`evidence-types.ts` as a Zod schema, with explicit `.max()` bounds on every array and
string (e.g. `buttonsFound` capped at 10 entries of 200 chars each,
`consoleErrors`/`failedRequests` capped at their `limits.max*` values, `sanitizedExcerpt`
capped at a few hundred chars) so the schema itself is a hard backstop even if a
sanitizer or cap upstream has a bug.

- **Before persistence:** `saveScan()` calls `AuditEvidenceV2Schema.parse(evidence)`.
  If it throws, the audit is treated as failed (`failAudit`) rather than persisting
  invalid evidence — schema validation failing is a real defect, not something to paper
  over.
- **On read:** `getAudit`/`getOwnedAuditFull` (`src/lib/db/audits.ts`) run
  `AuditEvidenceV2Schema.safeParse(raw.evidence)` after the existing unchecked
  `extracted_json` cast, on whatever value is present under the `evidence` key. On
  success, the parsed value is assigned to `page.evidence`. **On failure — or when
  `evidence` is simply absent (every pre-sprint row) — `page.evidence` is set to
  `undefined` and a sanitized log line is written** (audit id, issue count/paths from
  the Zod error — never field values), so a corrupt or legacy row degrades to exactly
  the same "no evidence" path already required for backward compatibility. It never
  throws up through the page/API route.
- Sanitization (above) removes unsafe *content* before it's ever assembled into the
  evidence object; Zod's `.max()` bounds are a *shape and size* backstop layered on top
  — the two are complementary, neither substitutes for the other.

### Cookie screenshot lifecycle

At scan time, cookie-banner before/after screenshots exist only as in-memory `Buffer`s
— there is no URL yet, and a `Buffer` must never be serialized into JSONB.

- `scanHomepage()`'s return type gains
  `cookieBannerScreenshots: { desktop: { before?: Buffer; after?: Buffer }; mobile: { before?: Buffer; after?: Buffer } }`,
  captured immediately before and after the dismiss attempt, per viewport.
- `process-audit.ts` uploads these via a new `uploadCookieBannerScreenshots(auditId,
  buffers)` (same JPEG-quality/size convention as the existing `uploadCtaScreenshots`),
  producing deterministic paths (e.g. `${auditId}/cookie-banner-desktop-before.jpg`).
- **Only after a successful upload** are `CookieBannerEvidence.screenshotBeforeDismiss`/
  `.screenshotAfterDismiss` set, to the uploaded URL — mirroring exactly how
  `desktopScreenshotPath`/`ctaJourneys[].screenshotPath` are already patched onto `page`
  post-upload today (`process-audit.ts:14-18`), not a new pattern.
- No local path and no `Buffer` ever reaches `saveScan()`/`extracted_json`.
- **If an upload fails, the corresponding screenshot field stays absent** (never a
  fabricated placeholder URL) and the failure is recorded as
  `{ id: "cookie-banner-screenshot-upload", status: "failed", reason: <sanitized error> }`
  in `methodology.tests` — evidence of what didn't work, not invented evidence of what
  did.

## Security and privacy

- Every redirect hop — page-level and CTA-level — is re-validated with the existing
  `assertSafeUrl`/`resolveSafeHostAddress` SSRF guards before being followed. No new
  navigation point in this sprint bypasses them; the fixture's redirect-to-private-
  address case exists specifically to demonstrate this in a live run, not just unit-level.
- No authenticated/private pages are ever audited (unchanged — out of scope to alter).
- No form values are read, only field `name`/`type`/label-presence.
- No cookies, tokens, or authorization headers are ever captured into evidence, logs, or
  the report — this extends the existing `raw` Lighthouse JSON stripping
  (`generate-report.ts:12`) to every new evidence field before it reaches an AI prompt.
- All arrays and strings are capped (both by the sanitizer and, as a backstop, by the
  Zod schema) **before** anything is sent to an AI expert, matching the existing
  pattern.
- Every string collected from the audited page — console messages, JSON-LD content,
  link text, form field names — is untrusted data, never instructions, exactly like the
  existing `commonRules` framing in `experts/shared.ts:3`. This framing is extended
  explicitly to cover the new evidence fields when they're eventually wired into expert
  prompts (a later sprint, not this one).

## Persistence and backward compatibility

- **No new migration.** `ExtractedPage.evidence?: AuditEvidenceV2` is optional and
  serializes through the existing `audit_pages.extracted_json` jsonb column exactly like
  every other `ExtractedPage` field does today (`db/audits.ts:88`), now with the
  `parse`/`safeParse` guard described above at both ends.
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
- The legacy `ExtractedPage.cookieBanner`/`ExtractedPage.ctaJourneys` fields are, from
  this sprint forward, always derived from the v2 evidence (see the "single source of
  truth" notes above) — they are never computed by a second, independent code path, so
  they cannot drift out of sync with what the v2 contract says was actually observed.
- `auditDataIsInconsistent()` (`src/lib/audit/consistency.ts`) is unchanged — it gates
  on `report`/`metrics` presence, which this sprint doesn't touch.

## Worker pipeline integration

New collection steps slot into `scanHomepage()` (`browser-scanner.ts`, for
Playwright/DOM-derived evidence — the per-viewport `extract()` calls, cookie banner
detect/dismiss split, console/network listeners) and into `PerformanceEvidence`
assembly alongside the existing `runLighthouse()` call in `process-audit.ts`. The
methodology record (`startedAt`/`finishedAt`/redirects/`tests`) is assembled by
`processNextAudit()` itself, since it's the only place that sees the whole run.
Immediately before `saveScan()` persists it, the assembled evidence passes through
`sanitizeText`/`sanitizeUrl` on every free-text/URL field and then
`AuditEvidenceV2Schema.parse()` — a scanner bug that produces malformed evidence fails
the audit loudly (`failAudit`) rather than silently writing bad data. `saveScan()`'s
signature is otherwise unchanged: the assembled, validated `AuditEvidenceV2` is part of
the same `page` object already upserted into `extracted_json`.

## Testing plan — controlled fixture

**Fixture hosting — corrected.** A `localhost`/private-network fixture cannot be used:
the existing SSRF guards (`assertSafeUrl`/`resolveSafeHostAddress`) deliberately block
private/loopback targets, so a localhost fixture would never actually traverse the real
pipeline — it would only prove the guards work, which we already know. Instead: a
**temporary, standalone Vercel deployment**, a small static page containing only
synthetic placeholder content, with a `noindex, nofollow` robots meta tag, not linked
from anywhere, not in any sitemap. Its URL is tracked only in a temp file during
verification (never committed, per the existing test-data protocol), and the
deployment is torn down after the test completes.

The fixture deliberately includes:

- Different desktop/mobile layouts (so independent extraction is actually exercised,
  not coincidentally identical).
- A detectable cookie banner with a real dismiss control.
- One same-origin CTA that redirects at least once.
- One external CTA that must be recorded as `external-not-visited`, never navigated.
- **One CTA (or the page's own initial load) that redirects to a private/internal
  address** (e.g. a loopback or link-local target) — this hop must be observed as
  blocked by `assertSafeUrl`/`resolveSafeHostAddress`, proving per-hop redirect
  revalidation actually runs on every hop, not just the entry and final URLs.
- canonical, robots meta, hreflang, and valid JSON-LD (plus one intentionally malformed
  JSON-LD block, to exercise `parsed: false`/`parseError`).
- A deliberate console error and a deliberately failing network request (e.g. a 404
  sub-resource).
- One form with labeled inputs and one form with an unlabeled input.

**Final criteria:**
- Extracted evidence matches the fixture's known, deliberately-built content.
- No sensitive data (form values, cookies, tokens, headers, full JSON-LD scripts) is
  ever persisted.
- Lab TBT and field INP are structurally and visibly separate — never combined into one
  field or one label, and field INP reads "not-assessed," never a guessed value.
- `cookieBanner.detected` and `.dismissed` can independently be `true`/`false` — verified
  against the fixture's real banner — and `blocking`/`blockingStatus` is `null`/
  `"not-assessed"` if the structural check can't run, never `false`.
- The redirect-to-private-address hop is confirmed blocked in the live run, not just
  asserted.
- `AuditEvidenceV2Schema.parse()` succeeds on the real assembled evidence, and
  `safeParse()` on a deliberately corrupted copy is confirmed to degrade to
  `page.evidence === undefined` without throwing.
- `/audits/demo` and the existing status/report endpoints are unaffected — regression
  check against the current (pre-this-sprint) behavior.
- `typecheck`, `lint`, `build` all pass.
- A real audit run against the temporary Vercel fixture, executed through the actual
  worker pipeline (not a mocked unit test), produces a persisted `AuditEvidenceV2`
  record matching the criteria above.
- Full cleanup: the fixture audit row(s), the temporary Vercel deployment, and any temp
  files tracking the fixture URL are all removed; no credential, token, or test data is
  committed at any point (consistent with the Preflight confirmation above).
