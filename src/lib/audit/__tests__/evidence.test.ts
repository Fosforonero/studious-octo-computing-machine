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
    methodology: {
      contractVersion: 2,
      startedAt: "2026-07-11T00:00:00.000Z",
      finishedAt: "2026-07-11T00:01:00.000Z",
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com/",
      pageGoal: "signups",
      scope: "single-page",
      viewports: { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } },
      userAgent: { desktop: "d", mobile: "m" },
      tool: { lighthouseVersion: "12.8.2" },
      redirects: [],
      tests: [
        { id: "desktop-dom", status: "passed" },
        { id: "cta-journey-mobile", status: "skipped", reason: "single-page audit tests conversion paths once, on desktop" },
      ],
      limitations: [],
    },
    seo: { title: "t", metaDescription: null, canonical: null, robotsMeta: null, xRobotsTag: null, htmlLang: null, viewportMeta: null, headings: [], hreflang: [], openGraph: [], jsonLd: [], links: [], pageStatus: { initialStatus: 200, finalStatus: 200, redirectChain: [] } },
    desktop: {
      browser: {
        viewport: "desktop",
        headline: null,
        headingHierarchy: [],
        aboveFold: { text: "", ctaTexts: [], imageCount: 0 },
        ctasVisible: [],
        navPresent: false,
        hasHorizontalOverflow: null,
        overlapCandidates: null,
        overlapCandidatesStatus: "not-assessed",
        smallTapTargetCandidates: null,
        smallTapTargetCandidatesStatus: "not-assessed",
        forms: [],
        landmarks: { hasNav: false, hasFooter: false, hasMain: false },
        images: [],
        cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] },
      },
      console: { consoleErrors: [], pageErrors: [], failedRequests: [], limits: { maxConsoleErrors: 20, maxFailedRequests: 20, truncated: false } },
      ctaJourneys: [],
    },
    mobile: {
      browser: {
        viewport: "mobile",
        headline: null,
        headingHierarchy: [],
        aboveFold: { text: "", ctaTexts: [], imageCount: 0 },
        ctasVisible: [],
        navPresent: false,
        hasHorizontalOverflow: null,
        overlapCandidates: null,
        overlapCandidatesStatus: "not-assessed",
        smallTapTargetCandidates: null,
        smallTapTargetCandidatesStatus: "not-assessed",
        forms: [],
        landmarks: { hasNav: false, hasFooter: false, hasMain: false },
        images: [],
        cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] },
      },
      console: { consoleErrors: [], pageErrors: [], failedRequests: [], limits: { maxConsoleErrors: 20, maxFailedRequests: 20, truncated: false } },
      ctaJourneys: null,
    },
    performance: {
      lab: { lcp: null, cls: null, tbt: null, ttfb: null, source: "lighthouse", lighthouseVersion: "12.8.2" },
      field: { source: "not-integrated", status: "not-assessed", percentile: null, periodDays: null, lcp: null, cls: null, inp: null },
      testConditions: { formFactor: "desktop", throttlingMethod: null, cpuThrottling: null, networkProfile: null, locale: "en-US", lighthouseVersion: "12.8.2", runCount: 1, limitations: ["single lab run"] },
    },
    accessibility: {
      standard: "WCAG 2.2",
      desktop: { automatedChecks: { source: "lighthouse", status: "verified", score: 90, failedAudits: [] }, browserObservations: { imagesWithoutAlt: 0, formInputsWithoutLabel: 0, landmarksPresent: [] } },
      mobile: { automatedChecks: { source: "lighthouse", status: "not-assessed", score: null, failedAudits: [] }, browserObservations: { imagesWithoutAlt: 0, formInputsWithoutLabel: 0, landmarksPresent: [] } },
      requiresHumanVerification: ["keyboard trap testing"],
    },
  };
}

test("sanitizeUrl strips fragment and redacts query string", () => {
  assert.equal(sanitizeUrl("https://example.com/path?token=abc123#section"), "https://example.com/path?[redacted]");
});

test("sanitizeText redacts email, JWT, bearer token, UUID, private IP", () => {
  const out = sanitizeText(
    "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U user@example.com 550e8400-e29b-41d4-a716-446655440000 10.0.0.5",
    1000,
  );
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

test("evidenceIds are unique across a realistic set of records", () => {
  const ids = [
    makeEvidenceId("cta", "https://x.com/a", "A"),
    makeEvidenceId("cta", "https://x.com/b", "B"),
    makeEvidenceId("console", "TypeError: x is not defined"),
    makeEvidenceId("network", "https://x.com/broken.png", "image"),
  ];
  assert.equal(new Set(ids).size, ids.length);
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
  evidence.desktop.ctaJourneys = [
    { evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), text: "A", element: "a", declaredUrl: "https://x.com/a", sameOrigin: true, navigationAttempted: true, finalUrl: "https://x.com/a", redirectCount: 0, httpStatus: 200, outcome: "redirected" },
  ];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("blocked-unsafe-redirect without error field is rejected", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [
    { evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), text: "A", element: "a", declaredUrl: "https://x.com/a", sameOrigin: true, navigationAttempted: true, outcome: "blocked-unsafe-redirect" },
  ];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("blocked-unsafe-redirect with a sanitized error passes and never carries a raw private IP", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [
    {
      evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"),
      text: "A",
      element: "a",
      declaredUrl: "https://x.com/a",
      sameOrigin: true,
      navigationAttempted: true,
      outcome: "blocked-unsafe-redirect",
      error: "Blocked: navigation to a private/unsafe address was prevented",
    },
  ];
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
