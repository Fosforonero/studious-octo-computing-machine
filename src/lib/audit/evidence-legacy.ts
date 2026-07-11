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
  switch (journey.outcome) {
    case "navigated":
      return `Loaded: ${journey.finalUrl ?? journey.declaredUrl}`;
    case "redirected":
      return `Loaded after redirect: ${journey.finalUrl ?? journey.declaredUrl}`;
    case "http-error":
      return `HTTP ${journey.httpStatus ?? "error"}`;
    case "network-error":
      return journey.error ?? "Could not load";
    case "blocked-unsafe-redirect":
      return "Blocked: unsafe redirect destination";
    case "external-not-visited":
      return "External destination detected";
    case "skipped-limit":
      return "Not tested — audit is capped at the first 5 conversion paths";
    case "skipped-invalid-url":
      return "Not tested — invalid or unsupported URL";
  }
}
