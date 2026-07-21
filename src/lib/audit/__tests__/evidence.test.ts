import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeUrl, sanitizeText, sanitizeEvidenceV2, hashContent } from "@/lib/audit/evidence-sanitize";
import { makeEvidenceId, dedupeEvidenceIds } from "@/lib/audit/evidence-id";
import { AuditEvidenceV2Schema } from "@/lib/audit/evidence-schema";
import { deriveLegacyCookieBanner, deriveLegacyCtaJourneys } from "@/lib/audit/evidence-legacy";
import { clearScreenshotBuffer, clearCookieBannerBuffers, type BrowserScanResult } from "@/lib/audit/browser-scanner";
import type { AuditEvidenceV2, CtaJourneyEvidence } from "@/lib/audit/evidence-types";

function baseCta(overrides: Partial<CtaJourneyEvidence> & Pick<CtaJourneyEvidence, "evidenceId" | "declaredUrl" | "outcome" | "interaction">): CtaJourneyEvidence {
  return {
    text: "A",
    element: "a",
    role: null,
    type: null,
    locator: 'a[1 of 1 matching "A"]',
    sameOrigin: true,
    navigationAttempted: true,
    ...overrides,
  };
}

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

test("dedupeEvidenceIds gives colliding ids a stable, order-dependent suffix instead of silently merging", () => {
  const items = [
    { evidenceId: "cta:aaaa", text: "Subscribe" },
    { evidenceId: "cta:aaaa", text: "Subscribe (second form)" },
    { evidenceId: "cta:bbbb", text: "Learn more" },
    { evidenceId: "cta:aaaa", text: "Subscribe (third form)" },
  ];
  const deduped = dedupeEvidenceIds(items);
  const ids = deduped.map((i) => i.evidenceId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ["cta:aaaa", "cta:aaaa-2", "cta:bbbb", "cta:aaaa-3"]);
  // Re-running on the same input in the same order reproduces the same suffixes.
  assert.deepEqual(dedupeEvidenceIds(items).map((i) => i.evidenceId), ids);
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
  const journey = baseCta({ evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), declaredUrl: "https://x.com/a", outcome: "navigated", interaction: "clicked" });
  evidence.desktop.ctaJourneys = [journey];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("navigated outcome with interaction=not-tested is rejected — 'navigated' can only follow a real click or a declared-URL check", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), declaredUrl: "https://x.com/a", outcome: "navigated", interaction: "not-tested", finalUrl: "https://x.com/a", redirectCount: 0, httpStatus: 200 })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("redirected outcome with redirectCount=0 is rejected", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [
    baseCta({ evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), declaredUrl: "https://x.com/a", interaction: "clicked", finalUrl: "https://x.com/a", redirectCount: 0, httpStatus: 200, outcome: "redirected" }),
  ];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("blocked-unsafe-redirect without error field is rejected", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), declaredUrl: "https://x.com/a", interaction: "clicked", outcome: "blocked-unsafe-redirect" })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("blocked-unsafe-redirect with a sanitized error passes and never carries a raw private IP", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [
    baseCta({
      evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"),
      declaredUrl: "https://x.com/a",
      interaction: "clicked",
      outcome: "blocked-unsafe-redirect",
      error: "Blocked: navigation to a private/unsafe address was prevented",
    }),
  ];
  const result = AuditEvidenceV2Schema.safeParse(evidence);
  assert.equal(result.success, true);
  if (result.success) assert.doesNotMatch(JSON.stringify(result.data), /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
});

test("no-navigation requires interaction=clicked (a followed-declared-url click can never produce it)", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "https://x.com/a", "A"), declaredUrl: "https://x.com/a", interaction: "followed-declared-url", outcome: "no-navigation" })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("no-navigation with interaction=clicked passes — replaces the old false 'navigated to homepage' behavior for a no-op button", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "button", "Toggle"), declaredUrl: "https://x.com/", element: "button", interaction: "clicked", outcome: "no-navigation" })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, true);
});

test("skipped-potentially-state-changing requires interaction=not-tested and a skippedReason", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "submit", "Save"), declaredUrl: "https://x.com/", element: "button", type: "submit", interaction: "clicked", navigationAttempted: false, outcome: "skipped-potentially-state-changing" })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "submit", "Save"), declaredUrl: "https://x.com/", element: "button", type: "submit", interaction: "not-tested", navigationAttempted: false, outcome: "skipped-potentially-state-changing", skippedReason: "Potentially state-changing" })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, true);
});

test("skipped-ambiguous-locator requires interaction=not-tested and a skippedReason", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "a", "Learn more"), declaredUrl: "https://x.com/", interaction: "not-tested", navigationAttempted: false, outcome: "skipped-ambiguous-locator", skippedReason: "Could not uniquely re-identify this element" })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, true);
});

test("skipped-unactionable requires interaction=not-tested, navigationAttempted=false and a skippedReason — a button click failure never becomes followed-declared-url or network-error", () => {
  const evidence = validEvidence();
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "button", "Toggle"), declaredUrl: "https://x.com/", element: "button", interaction: "clicked", navigationAttempted: true, outcome: "skipped-unactionable" })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: makeEvidenceId("cta", "button", "Toggle"), declaredUrl: "https://x.com/", element: "button", interaction: "not-tested", navigationAttempted: false, outcome: "skipped-unactionable", skippedReason: "Could not click this element and it has no declared destination to verify directly" })];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, true);
});

test("field performance status=available without values is rejected", () => {
  const evidence = validEvidence();
  evidence.performance.field = { source: "crux", status: "available", percentile: 75, periodDays: 28, lcp: null, cls: null, inp: null };
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("field performance source=not-integrated cannot have status=available", () => {
  const evidence = validEvidence();
  evidence.performance.field = { source: "not-integrated", status: "available", percentile: 75, periodDays: 28, lcp: 1000, cls: 0.1, inp: 100 };
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("mobile.ctaJourneys=null without a cta-journey-mobile skip record is rejected", () => {
  const evidence = validEvidence();
  evidence.methodology.tests = evidence.methodology.tests.filter((t) => t.id !== "cta-journey-mobile");
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("desktop.browser.viewport must be \"desktop\" and mobile.browser.viewport must be \"mobile\"", () => {
  const evidence = validEvidence();
  evidence.desktop.browser.viewport = "mobile";
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("overlapCandidates must be null iff overlapCandidatesStatus is not-assessed", () => {
  const evidence = validEvidence();
  evidence.desktop.browser.overlapCandidatesStatus = "verified";
  evidence.desktop.browser.overlapCandidates = null;
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
  evidence.desktop.browser.overlapCandidates = [{ evidenceId: makeEvidenceId("overlap", "x"), selector: "div", overlapsWithSelector: "body", issue: "overlap", boundingBox: { x: 0, y: 0, width: 1, height: 1 }, status: "inferred" }];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, true);
  evidence.desktop.browser.overlapCandidatesStatus = "not-assessed";
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("smallTapTargetCandidates must be null iff smallTapTargetCandidatesStatus is not-assessed", () => {
  const evidence = validEvidence();
  evidence.mobile.browser.smallTapTargetCandidatesStatus = "verified";
  evidence.mobile.browser.smallTapTargetCandidates = null;
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("contentMatch must be non-null whenever contentMatchStatus is not not-assessed", () => {
  const evidence = validEvidence();
  evidence.seo.jsonLd = [{ evidenceId: "jsonld:abc", parsed: true, types: ["Product"], excerptHash: "a".repeat(64), contentMatch: null, contentMatchStatus: "inferred" }];
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
  evidence.seo.jsonLd[0].contentMatch = true;
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, true);
});

test("cookie dismissed=true requires dismissAttempted=true", () => {
  const evidence = validEvidence();
  evidence.desktop.browser.cookieBanner = { detected: true, dismissAttempted: false, dismissed: true, blocking: false, blockingStatus: "verified", buttonsFound: ["Accept"] };
  assert.equal(AuditEvidenceV2Schema.safeParse(evidence).success, false);
});

test("cookie screenshots cannot exist when detected=false", () => {
  const evidence = validEvidence();
  evidence.desktop.browser.cookieBanner = { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [], screenshotBeforeDismiss: "https://storage/x.jpg" };
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
    baseCta({ evidenceId: "cta:aaa", declaredUrl: "https://x.com/a", interaction: "clicked", finalUrl: "https://x.com/a", redirectCount: 0, httpStatus: 200, outcome: "navigated", screenshotRef: "https://storage/a.jpg" }),
    baseCta({ evidenceId: "cta:bbb", text: "B", declaredUrl: "https://x.com/b", interaction: "clicked", finalUrl: "https://x.com/b", redirectCount: 0, httpStatus: 200, outcome: "navigated", screenshotRef: "https://storage/b.jpg" }),
  ];
  const legacy = deriveLegacyCtaJourneys(journeys);
  assert.equal(legacy[0].screenshotPath, "https://storage/a.jpg");
  assert.equal(legacy[1].screenshotPath, "https://storage/b.jpg");
});

test("deriveLegacyCtaJourneys never says 'Clicked' for a followed-declared-url journey", () => {
  const journeys: CtaJourneyEvidence[] = [baseCta({ evidenceId: "cta:ccc", declaredUrl: "https://x.com/c", interaction: "followed-declared-url", finalUrl: "https://x.com/c", redirectCount: 0, httpStatus: 200, outcome: "navigated" })];
  const legacy = deriveLegacyCtaJourneys(journeys);
  assert.doesNotMatch(legacy[0].outcome, /^Clicked/);
});

test("deriveLegacyCtaJourneys covers no-navigation, skipped-potentially-state-changing, skipped-ambiguous-locator and skipped-unactionable", () => {
  const journeys: CtaJourneyEvidence[] = [
    baseCta({ evidenceId: "cta:1", declaredUrl: "https://x.com/", element: "button", interaction: "clicked", navigationAttempted: true, outcome: "no-navigation" }),
    baseCta({ evidenceId: "cta:2", declaredUrl: "https://x.com/", element: "button", type: "submit", interaction: "not-tested", navigationAttempted: false, outcome: "skipped-potentially-state-changing", skippedReason: "state-changing" }),
    baseCta({ evidenceId: "cta:3", declaredUrl: "https://x.com/", interaction: "not-tested", navigationAttempted: false, outcome: "skipped-ambiguous-locator", skippedReason: "ambiguous" }),
    baseCta({ evidenceId: "cta:4", declaredUrl: "https://x.com/", element: "button", interaction: "not-tested", navigationAttempted: false, outcome: "skipped-unactionable", skippedReason: "unactionable" }),
  ];
  const legacy = deriveLegacyCtaJourneys(journeys);
  assert.match(legacy[0].outcome, /no navigation/i);
  assert.match(legacy[1].outcome, /state-changing/i);
  assert.match(legacy[2].outcome, /uniquely re-identify/i);
  assert.match(legacy[3].outcome, /could not be clicked/i);
});

test("no Buffer or absolute local filesystem path survives into a schema-valid evidence object", () => {
  const evidence = validEvidence();
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /"type":"Buffer"/);
  assert.doesNotMatch(serialized, /\/Volumes\/|\/private\/tmp\/|\/Users\//);
});

test("clearScreenshotBuffer and clearCookieBannerBuffers actually remove Buffers from a populated lifecycle object (exercises the real cleanup path used by process-audit.ts)", () => {
  const ctaScreenshots = [{ evidenceId: "cta:aaa", buffer: Buffer.from("jpeg-bytes") as Buffer | undefined }];
  ctaScreenshots.forEach(clearScreenshotBuffer);
  assert.equal(ctaScreenshots[0].buffer, undefined);
  assert.doesNotMatch(JSON.stringify(ctaScreenshots), /"type":"Buffer"/);

  const cookieBannerScreenshots: BrowserScanResult["cookieBannerScreenshots"] = {
    desktop: { before: Buffer.from("a"), after: Buffer.from("b") },
    mobile: { before: Buffer.from("c"), after: Buffer.from("d") },
  };
  clearCookieBannerBuffers(cookieBannerScreenshots);
  assert.deepEqual(cookieBannerScreenshots, { desktop: { before: undefined, after: undefined }, mobile: { before: undefined, after: undefined } });
  assert.doesNotMatch(JSON.stringify(cookieBannerScreenshots), /"type":"Buffer"/);
});

test("hashContent is deterministic", () => {
  assert.equal(hashContent("<script>{}</script>"), hashContent("<script>{}</script>"));
});

test("redactSensitivePatterns-backed sanitizeText redacts private IPv6 and internal hostnames", () => {
  const out = sanitizeText("link-local fe80::1ff:fe23:4567:890a and internal host db1.internal and localhost:5432", 1000);
  assert.doesNotMatch(out, /fe80::1ff/);
  assert.doesNotMatch(out, /db1\.internal/);
  assert.doesNotMatch(out, /localhost:5432/);
});

test("sanitizeText redacts raw and bracketed IPv6 loopback (::1 and [::1]) — a \\b-anchored pattern never matches either, since : and [ ] are never word characters", () => {
  const rawOut = sanitizeText("connect to ::1 for local testing", 1000);
  assert.doesNotMatch(rawOut, /::1/);
  const bracketedOut = sanitizeText("internal probe hit http://[::1]/admin unexpectedly", 1000);
  assert.doesNotMatch(bracketedOut, /::1/);
});

test("sanitizeEvidenceV2 redacts sensitive content across every major evidence group, not just one nested href", () => {
  const evidence = validEvidence();
  const email = "leak@example.com";
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const token = "aVeryLongOpaqueToken1234567890123456";
  const privateIp = "10.1.2.3";
  const privateIpv6 = "fe80::1ff:fe23:4567:890a";
  const secret = `${email} ${uuid} ${token} ${privateIp} ${privateIpv6}`;

  evidence.methodology.pageGoal = `signups ${secret}`;
  evidence.desktop.browser.headline = `Welcome ${secret}`;
  evidence.desktop.browser.headingHierarchy = [{ level: 2, text: `Section ${secret}` }];
  evidence.desktop.browser.aboveFold = { text: `Fold ${secret}`, ctaTexts: [`CTA ${secret}`], imageCount: 0 };
  evidence.desktop.browser.cookieBanner = { detected: true, dismissAttempted: true, dismissed: true, blocking: false, blockingStatus: "verified", buttonsFound: [`Accept ${secret}`] };
  evidence.seo.title = `Title ${secret}`;
  evidence.seo.metaDescription = `Description ${secret}`;
  evidence.seo.robotsMeta = `index, ${secret}`;
  evidence.seo.xRobotsTag = `noindex, ${secret}`;
  evidence.seo.htmlLang = `en ${secret}`;
  evidence.seo.viewportMeta = `width=device-width ${secret}`;
  evidence.seo.headings = [{ level: 1, text: `Heading ${secret}` }];
  evidence.seo.links = [{ text: `Link ${secret}`, href: "https://example.com/x", sameOrigin: true }];
  evidence.seo.hreflang = [{ evidenceId: "hreflang:1", lang: `en ${secret}`, href: "https://example.com/en" }];
  evidence.seo.openGraph = [{ evidenceId: "og:1", property: `og:title ${secret}`, content: `content ${secret}` }];
  evidence.seo.jsonLd = [{ evidenceId: "jsonld:abc", parsed: false, types: [`Product ${secret}`], parseError: `bad json ${secret}`, excerptHash: "a".repeat(64), contentMatch: null, contentMatchStatus: "not-assessed" }];
  evidence.desktop.console.failedRequests = [{ evidenceId: "network:1", url: "https://example.com/x", resourceType: "image", domain: `${secret}.example.com`, status: 404 }];
  evidence.accessibility.desktop.automatedChecks.failedAudits = [{ evidenceId: "acc:1", id: "color-contrast", title: `Contrast issue ${secret}`, impact: `serious ${secret}` }];
  evidence.desktop.ctaJourneys = [baseCta({ evidenceId: "cta:x", text: `Click ${secret}`, declaredUrl: "https://example.com/x", interaction: "clicked", outcome: "network-error", error: `Failed ${secret}`, skippedReason: undefined })];

  const sanitized = sanitizeEvidenceV2(evidence);
  const serialized = JSON.stringify(sanitized);
  for (const needle of [email, uuid, token, privateIp, privateIpv6]) {
    assert.doesNotMatch(serialized, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `expected "${needle}" to be redacted somewhere in the sanitized evidence`);
  }
});
