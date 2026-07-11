export type EvidenceStatus = "verified" | "inferred" | "not-assessed";
export type EvidenceId = string;

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

// Geometric measurement is "verified"; whether it represents a real problem is always
// "inferred" — an overlay can be intentional, a small target can satisfy a WCAG 2.5.8
// exception. `status` is a literal, not the generic EvidenceStatus, because a *populated*
// candidate's conclusion is never verified and never not-assessed — only ever inferred.
export interface OverlapCandidate {
  evidenceId: EvidenceId;
  selector: string;
  overlapsWithSelector: string;
  issue: "cutoff" | "overlap";
  boundingBox: BoundingBox;
  status: "inferred";
}

export interface SmallTapTargetCandidate {
  evidenceId: EvidenceId;
  selector: string;
  boundingBox: BoundingBox;
  widthPx: number;
  heightPx: number;
  status: "inferred";
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

// Whether Lensiq actually clicked the element, only verified its declared destination by
// direct navigation (a fallback when a real click could not be performed for a benign,
// non-security reason — e.g. the element became unactionable on a fresh reload), or never
// interacted with it at all. The report may only say "I click" when this is "clicked".
export type CtaInteraction = "clicked" | "followed-declared-url" | "not-tested";

export type CtaOutcome =
  | "navigated"
  | "redirected"
  | "no-navigation"
  | "http-error"
  | "network-error"
  | "blocked-unsafe-redirect"
  | "external-not-visited"
  | "skipped-limit"
  | "skipped-invalid-url"
  | "skipped-potentially-state-changing"
  | "skipped-ambiguous-locator";

export interface CtaJourneyEvidence {
  evidenceId: EvidenceId;
  text: string;
  element: string;
  role: string | null;
  type: string | null;
  // Sanitized, human-readable description of how the element was re-identified on a
  // fresh page load (tag + normalized text + DOM-order index within same tag+text
  // group) — enough to locate the exact element again, never a raw CSS/XPath dump of
  // page-authored attributes.
  locator: string;
  interaction: CtaInteraction;
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

export interface ConsoleErrorEvidence {
  evidenceId: EvidenceId;
  message: string;
  timestamp: string;
}

export interface PageErrorEvidence {
  evidenceId: EvidenceId;
  message: string;
  timestamp: string;
}

export interface FailedRequestEvidence {
  evidenceId: EvidenceId;
  url: string;
  resourceType: string;
  domain: string;
  status: number | null;
  message?: string;
}

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

export interface HreflangEvidence {
  evidenceId: EvidenceId;
  lang: string;
  href: string;
}

export interface OpenGraphEvidence {
  evidenceId: EvidenceId;
  property: string;
  content: string;
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

export interface AccessibilityObservation {
  evidenceId: EvidenceId;
  id: string;
  title: string;
  impact?: string;
}

// Explicitly per-viewport — Lighthouse itself only runs once (desktop), so mobile's
// automatedChecks MUST read not-assessed, never silently inherit desktop's score.
// browserObservations, by contrast, genuinely exist for both viewports (independent
// per-viewport DOM extraction), so they're populated for real on both sides.
export interface AccessibilityEvidence {
  standard: "WCAG 2.2";
  desktop: {
    automatedChecks: { source: "lighthouse"; status: "verified"; score: number; failedAudits: AccessibilityObservation[] };
    browserObservations: { imagesWithoutAlt: number; formInputsWithoutLabel: number; landmarksPresent: string[] };
  };
  mobile: {
    // failedAudits is always empty at runtime (mobile has no separate Lighthouse run,
    // enforced by the Zod schema's .max(0)) — typed as a regular array, not a literal
    // `[]` tuple, since Zod's inferred output type for a length-capped array is
    // AccessibilityObservation[], and forcing the stricter tuple type here would fight
    // that inference for no real safety gain.
    automatedChecks: { source: "lighthouse"; status: "not-assessed"; score: null; failedAudits: AccessibilityObservation[] };
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
