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
