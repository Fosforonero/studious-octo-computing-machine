import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { chromium } from "playwright";
import type { AuditMetrics } from "@/lib/audit/types";
import type { AccessibilityEvidence, PerformanceEvidence } from "@/lib/audit/evidence-types";
import { assertSafeUrl, resolveSafeHostAddress } from "@/lib/security/url";
import { sanitizeUrl } from "@/lib/audit/evidence-sanitize";
import { makeEvidenceId } from "@/lib/audit/evidence-id";

const score = (value: number | null | undefined) => Math.round((value ?? 0) * 100);
const numeric = (audit: { numericValue?: number } | undefined) => audit?.numericValue ?? null;
const detailItems = (audit: { details?: unknown } | undefined) => ((audit?.details as { items?: Record<string, unknown>[] } | undefined)?.items ?? []);

export async function runLighthouse(inputUrl: string): Promise<{ metrics: AuditMetrics; evidence: PerformanceEvidence; lhr: import("lighthouse").Result }> {
  const url = await assertSafeUrl(inputUrl);
  const pinnedAddress = await resolveSafeHostAddress(new URL(url).hostname);
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--host-resolver-rules=MAP ${new URL(url).hostname} ${pinnedAddress}`],
  });
  try {
    const result = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "seo", "best-practices"] });
    if (!result?.lhr) throw new Error("Lighthouse did not return a report.");
    const { lhr } = result;
    const audits = lhr.audits;
    const imageIssues = ["uses-optimized-images", "uses-responsive-images", "modern-image-formats", "unsized-images"].filter((key) => audits[key] && audits[key].score !== null && Number(audits[key].score) < 1).map((key) => audits[key].title);

    const metrics: AuditMetrics = {
      performanceScore: score(lhr.categories.performance?.score),
      accessibilityScore: score(lhr.categories.accessibility?.score),
      seoScore: score(lhr.categories.seo?.score),
      bestPracticesScore: score(lhr.categories["best-practices"]?.score),
      lcp: numeric(audits["largest-contentful-paint"]),
      cls: numeric(audits["cumulative-layout-shift"]),
      // Always the lab-only Total Blocking Time audit specifically — never a fallback to
      // interaction-to-next-paint, which Lighthouse's unscripted run can't reliably
      // produce and which must never be passed off as TBT (or vice versa).
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
    const evidence: PerformanceEvidence = {
      lab: { lcp: metrics.lcp, cls: metrics.cls, tbt: metrics.inpOrTbt, ttfb: metrics.ttfb, source: "lighthouse", lighthouseVersion: lhr.lighthouseVersion },
      field: { source: "not-integrated", status: "not-assessed", percentile: null, periodDays: null, lcp: null, cls: null, inp: null },
      testConditions: {
        formFactor: lhr.configSettings.formFactor ?? "desktop",
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
  } finally { await chrome.kill(); }
}

export function buildAutomatedAccessibilityChecks(lhr: import("lighthouse").Result): AccessibilityEvidence["desktop"]["automatedChecks"] {
  const accessibilityAudits = Object.values(lhr.audits).filter((audit) => lhr.categories.accessibility?.auditRefs.some((ref) => ref.id === audit.id));
  const failedAudits = accessibilityAudits
    .filter((audit) => audit.score !== null && Number(audit.score) < 1)
    .map((audit) => ({ evidenceId: makeEvidenceId("accessibility", "desktop", audit.id), id: audit.id, title: audit.title }));
  return { source: "lighthouse", status: "verified", score: score(lhr.categories.accessibility?.score), failedAudits };
}
