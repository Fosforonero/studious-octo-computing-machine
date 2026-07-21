import type { CookieBannerEvidence, CtaJourneyEvidence } from "@/lib/audit/evidence-types";
import type { ExtractedPage } from "@/lib/audit/types";

export function deriveLegacyCookieBanner(evidence: CookieBannerEvidence): ExtractedPage["cookieBanner"] {
  return { detected: evidence.detected, dismissed: evidence.dismissed };
}

export function deriveLegacyCtaJourneys(evidence: CtaJourneyEvidence[]): ExtractedPage["ctaJourneys"] {
  return evidence.map((journey) => ({
    text: journey.text,
    destination: journey.finalUrl ?? journey.declaredUrl,
    outcome: legacyOutcomeText(journey),
    sameOrigin: journey.sameOrigin,
    screenshotPath: journey.screenshotRef,
  }));
}

function legacyOutcomeText(journey: CtaJourneyEvidence): string {
  const prefix = journey.interaction === "clicked" ? "Clicked" : journey.interaction === "followed-declared-url" ? "Verified declared URL (not clicked)" : null;
  switch (journey.outcome) {
    case "navigated":
      return `${prefix}: loaded ${journey.finalUrl ?? journey.declaredUrl}`;
    case "redirected":
      return `${prefix}: loaded after redirect to ${journey.finalUrl ?? journey.declaredUrl}`;
    case "no-navigation":
      return "Clicked: no navigation resulted";
    case "http-error":
      return `${prefix}: HTTP ${journey.httpStatus ?? "error"}`;
    case "network-error":
      return journey.error ?? "Could not load";
    case "blocked-unsafe-redirect":
      return "Blocked: unsafe redirect destination";
    case "external-not-visited":
      return "External destination detected — not visited";
    case "skipped-limit":
      return "Not tested — audit is capped at the first 5 conversion paths";
    case "skipped-invalid-url":
      return "Not tested — invalid or unsupported URL";
    case "skipped-potentially-state-changing":
      return "Not tested — potentially state-changing action (e.g. submit, purchase, delete)";
    case "skipped-ambiguous-locator":
      return "Not tested — could not uniquely re-identify this element";
    case "skipped-unactionable":
      return "Not tested — this element could not be clicked and has no declared destination to verify";
  }
}
