import { z } from "zod";

const evidenceStatus = z.enum(["verified", "inferred", "not-assessed"]);
const evidenceId = z.string().min(1).max(200);
const isoTimestamp = z.iso.datetime();
const httpStatus = z.number().int().min(100).max(599);
const boundingBox = z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() });

const testExecutionRecord = z
  .object({
    id: z.enum([
      "desktop-dom",
      "mobile-dom",
      "cta-journey-desktop",
      "cta-journey-mobile",
      "cookie-banner-desktop",
      "cookie-banner-mobile",
      "cookie-banner-screenshot-upload",
      "seo-extraction",
      "console-network-desktop",
      "console-network-mobile",
      "lighthouse-lab",
    ]),
    status: z.enum(["passed", "failed", "skipped"]),
    reason: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
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

const overlapCandidate = z.object({ evidenceId, selector: z.string().max(300), overlapsWithSelector: z.string().max(300), issue: z.enum(["cutoff", "overlap"]), boundingBox, status: z.literal("inferred") });
const smallTapTargetCandidate = z.object({ evidenceId, selector: z.string().max(300), boundingBox, widthPx: z.number().nonnegative(), heightPx: z.number().nonnegative(), status: z.literal("inferred") });

const cookieBannerEvidence = z
  .object({
    detected: z.boolean(),
    dismissAttempted: z.boolean(),
    dismissed: z.boolean(),
    blocking: z.boolean().nullable(),
    blockingStatus: evidenceStatus,
    buttonsFound: z.array(z.string().max(200)).max(10),
    screenshotBeforeDismiss: z.string().max(500).optional(),
    screenshotAfterDismiss: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.blockingStatus === "not-assessed" && val.blocking !== null) ctx.addIssue({ code: "custom", message: "blocking must be null when blockingStatus is not-assessed" });
    if (val.blockingStatus !== "not-assessed" && val.blocking === null) ctx.addIssue({ code: "custom", message: "blocking must not be null when blockingStatus is not not-assessed" });
    if (!val.detected && (val.dismissAttempted || val.dismissed)) ctx.addIssue({ code: "custom", message: "dismissAttempted/dismissed require detected" });
    if (val.dismissed && !val.dismissAttempted) ctx.addIssue({ code: "custom", message: "dismissed=true requires dismissAttempted=true" });
    if (!val.detected && (val.screenshotBeforeDismiss || val.screenshotAfterDismiss)) ctx.addIssue({ code: "custom", message: "cookie screenshots cannot exist when detected=false" });
  });

const ctaOutcome = z.enum([
  "navigated",
  "redirected",
  "no-navigation",
  "http-error",
  "network-error",
  "blocked-unsafe-redirect",
  "external-not-visited",
  "skipped-limit",
  "skipped-invalid-url",
  "skipped-potentially-state-changing",
  "skipped-ambiguous-locator",
]);
const ctaInteraction = z.enum(["clicked", "followed-declared-url", "not-tested"]);

const ctaJourneyEvidence = z
  .object({
    evidenceId,
    text: z.string().max(300),
    element: z.string().max(50),
    role: z.string().max(50).nullable(),
    type: z.string().max(50).nullable(),
    locator: z.string().max(300),
    interaction: ctaInteraction,
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
  })
  .superRefine((val, ctx) => {
    const requireSkipped = () => {
      if (!val.skippedReason) ctx.addIssue({ code: "custom", message: `skippedReason required for outcome ${val.outcome}` });
      if (val.interaction !== "not-tested") ctx.addIssue({ code: "custom", message: `${val.outcome} requires interaction=not-tested` });
    };
    switch (val.outcome) {
      case "external-not-visited":
        if (val.sameOrigin) ctx.addIssue({ code: "custom", message: "external-not-visited requires sameOrigin=false" });
        if (val.navigationAttempted) ctx.addIssue({ code: "custom", message: "external-not-visited requires navigationAttempted=false" });
        requireSkipped();
        break;
      case "skipped-limit":
      case "skipped-invalid-url":
      case "skipped-potentially-state-changing":
      case "skipped-ambiguous-locator":
        if (val.navigationAttempted) ctx.addIssue({ code: "custom", message: `${val.outcome} requires navigationAttempted=false` });
        requireSkipped();
        break;
      case "navigated":
      case "redirected":
        if (!val.navigationAttempted) ctx.addIssue({ code: "custom", message: `${val.outcome} requires navigationAttempted=true` });
        if (!val.finalUrl) ctx.addIssue({ code: "custom", message: `${val.outcome} requires finalUrl` });
        if (val.interaction === "not-tested") ctx.addIssue({ code: "custom", message: `${val.outcome} requires interaction=clicked or followed-declared-url` });
        if (val.outcome === "redirected" && !(val.redirectCount && val.redirectCount >= 1)) ctx.addIssue({ code: "custom", message: "redirected requires redirectCount >= 1" });
        break;
      case "no-navigation":
        if (!val.navigationAttempted) ctx.addIssue({ code: "custom", message: "no-navigation requires navigationAttempted=true" });
        if (val.interaction !== "clicked") ctx.addIssue({ code: "custom", message: "no-navigation only ever follows a real click — requires interaction=clicked" });
        break;
      case "http-error":
        if (!val.navigationAttempted) ctx.addIssue({ code: "custom", message: "http-error requires navigationAttempted=true" });
        if (val.httpStatus === undefined) ctx.addIssue({ code: "custom", message: "http-error requires httpStatus" });
        if (val.interaction === "not-tested") ctx.addIssue({ code: "custom", message: "http-error requires interaction=clicked or followed-declared-url" });
        break;
      case "network-error":
      case "blocked-unsafe-redirect":
        if (!val.navigationAttempted) ctx.addIssue({ code: "custom", message: `${val.outcome} requires navigationAttempted=true` });
        if (!val.error) ctx.addIssue({ code: "custom", message: `${val.outcome} requires error` });
        if (val.interaction === "not-tested") ctx.addIssue({ code: "custom", message: `${val.outcome} requires interaction=clicked or followed-declared-url` });
        break;
    }
  });

const browserEvidence = z
  .object({
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
  })
  .superRefine((val, ctx) => {
    if (val.overlapCandidatesStatus === "not-assessed" && val.overlapCandidates !== null) ctx.addIssue({ code: "custom", message: "overlapCandidates must be null when overlapCandidatesStatus is not-assessed" });
    if (val.overlapCandidatesStatus !== "not-assessed" && val.overlapCandidates === null) ctx.addIssue({ code: "custom", message: "overlapCandidates must not be null when overlapCandidatesStatus is not not-assessed" });
    if (val.smallTapTargetCandidatesStatus === "not-assessed" && val.smallTapTargetCandidates !== null) ctx.addIssue({ code: "custom", message: "smallTapTargetCandidates must be null when smallTapTargetCandidatesStatus is not-assessed" });
    if (val.smallTapTargetCandidatesStatus !== "not-assessed" && val.smallTapTargetCandidates === null) ctx.addIssue({ code: "custom", message: "smallTapTargetCandidates must not be null when smallTapTargetCandidatesStatus is not not-assessed" });
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

const jsonLdEvidence = z
  .object({
    evidenceId,
    parsed: z.boolean(),
    types: z.array(z.string().max(100)).max(20),
    parseError: z.string().max(300).optional(),
    excerptHash: z.string().length(64),
    sanitizedExcerpt: z.string().max(500).optional(),
    contentMatch: z.boolean().nullable(),
    contentMatchStatus: evidenceStatus,
  })
  .superRefine((val, ctx) => {
    if (val.contentMatchStatus === "not-assessed" && val.contentMatch !== null) ctx.addIssue({ code: "custom", message: "contentMatch must be null when not-assessed" });
    if (val.contentMatchStatus !== "not-assessed" && val.contentMatch === null) ctx.addIssue({ code: "custom", message: "contentMatch must not be null when contentMatchStatus is not not-assessed" });
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
  field: z
    .object({
      source: z.enum(["not-integrated", "crux"]),
      status: z.enum(["not-assessed", "insufficient-data", "available"]),
      percentile: z.literal(75).nullable(),
      periodDays: z.number().int().nonnegative().nullable(),
      lcp: z.number().nonnegative().nullable(),
      cls: z.number().nonnegative().nullable(),
      inp: z.number().nonnegative().nullable(),
    })
    .superRefine((val, ctx) => {
      if (val.status === "available") {
        if (val.source === "not-integrated") ctx.addIssue({ code: "custom", message: "source=not-integrated cannot have status=available" });
        if (val.lcp === null || val.cls === null || val.inp === null) ctx.addIssue({ code: "custom", message: "available field metrics require non-null lcp/cls/inp" });
        if (val.percentile === null || val.periodDays === null) ctx.addIssue({ code: "custom", message: "available field metrics require percentile/periodDays" });
      } else if (val.lcp !== null || val.cls !== null || val.inp !== null) {
        ctx.addIssue({ code: "custom", message: `${val.status} requires null lcp/cls/inp` });
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

export const AuditEvidenceV2Schema = z
  .object({
    contractVersion: z.literal(2),
    methodology: methodologyBase,
    seo: seoEvidence,
    desktop: viewportEvidence,
    mobile: viewportEvidence,
    performance: performanceEvidence,
    accessibility: accessibilityEvidence,
  })
  .superRefine((val, ctx) => {
    if (val.mobile.ctaJourneys === null) {
      const hasSkipRecord = val.methodology.tests.some((t) => t.id === "cta-journey-mobile" && t.status === "skipped" && t.reason);
      if (!hasSkipRecord) ctx.addIssue({ code: "custom", message: "mobile.ctaJourneys=null requires a cta-journey-mobile skipped test record with a reason" });
    }
    if (val.desktop.browser.viewport !== "desktop") ctx.addIssue({ code: "custom", message: "desktop.browser.viewport must be \"desktop\"" });
    if (val.mobile.browser.viewport !== "mobile") ctx.addIssue({ code: "custom", message: "mobile.browser.viewport must be \"mobile\"" });
  });
