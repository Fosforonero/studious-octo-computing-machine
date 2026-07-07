import { claimNextAudit, completeAudit, failAudit, saveScan } from "@/lib/db/audits";
import { scanHomepage } from "@/lib/audit/browser-scanner";
import { runLighthouse } from "@/lib/audit/lighthouse-scanner";
import { generateReport } from "@/lib/audit/generate-report";
import { uploadCtaScreenshots, uploadScreenshots } from "@/lib/storage/screenshots";

export async function processNextAudit() {
  const audit = await claimNextAudit();
  if (!audit) return null;
  try {
    const browserResult = await scanHomepage(audit.normalizedUrl);
    const metrics = await runLighthouse(browserResult.page.url);
    const screenshots = await uploadScreenshots(audit.id, browserResult.desktopScreenshot, browserResult.mobileScreenshot);
    browserResult.page.desktopScreenshotPath = screenshots.desktop;
    browserResult.page.mobileScreenshotPath = screenshots.mobile;
    const ctaScreenshots = await uploadCtaScreenshots(audit.id, browserResult.ctaScreenshots);
    for (const { index, path } of ctaScreenshots) browserResult.page.ctaJourneys[index].screenshotPath = path;
    await saveScan(audit.id, browserResult.page, metrics, screenshots);
    const report = await generateReport(browserResult.page, metrics, audit.pageGoal);
    await completeAudit(audit.id, report);
    return { id: audit.id, status: "completed" as const };
  } catch (error) {
    await failAudit(audit.id, error);
    return { id: audit.id, status: "failed" as const, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
