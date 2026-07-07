import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { chromium } from "playwright";
import type { AuditMetrics } from "@/lib/audit/types";
import { assertSafeUrl, resolveSafeHostAddress } from "@/lib/security/url";

const score = (value: number | null | undefined) => Math.round((value ?? 0) * 100);
const numeric = (audit: { numericValue?: number } | undefined) => audit?.numericValue ?? null;
const detailItems = (audit: { details?: unknown } | undefined) => ((audit?.details as { items?: Record<string, unknown>[] } | undefined)?.items ?? []);

export async function runLighthouse(inputUrl: string): Promise<AuditMetrics> {
  const url = await assertSafeUrl(inputUrl);
  const pinnedAddress = await resolveSafeHostAddress(new URL(url).hostname);
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu", `--host-resolver-rules=MAP ${new URL(url).hostname} ${pinnedAddress}`],
  });
  try {
    const result = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "seo", "best-practices"] });
    if (!result?.lhr) throw new Error("Lighthouse did not return a report.");
    const { lhr } = result;
    const audits = lhr.audits;
    const imageIssues = ["uses-optimized-images", "uses-responsive-images", "modern-image-formats", "unsized-images"].filter((key) => audits[key] && audits[key].score !== null && Number(audits[key].score) < 1).map((key) => audits[key].title);
    return {
      performanceScore: score(lhr.categories.performance?.score),
      accessibilityScore: score(lhr.categories.accessibility?.score),
      seoScore: score(lhr.categories.seo?.score),
      bestPracticesScore: score(lhr.categories["best-practices"]?.score),
      lcp: numeric(audits["largest-contentful-paint"]),
      cls: numeric(audits["cumulative-layout-shift"]),
      inpOrTbt: numeric(audits["interaction-to-next-paint"] ?? audits["total-blocking-time"]),
      ttfb: numeric(audits["server-response-time"]),
      imageIssues,
      renderBlockingResources: detailItems(audits["render-blocking-resources"]).length,
      scriptWeightBytes: Number(detailItems(audits["resource-summary"]).find((item) => item.resourceType === "script")?.transferSize ?? 0),
      raw: lhr,
    };
  } finally { await chrome.kill(); }
}
