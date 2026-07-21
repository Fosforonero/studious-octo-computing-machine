import { createHash } from "node:crypto";
import type { AuditEvidenceV2 } from "@/lib/audit/evidence-types";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const API_KEY_PATTERN = /\b(sk|pk|rk)_[A-Za-z0-9]{10,}\b|\bAIza[A-Za-z0-9_-]{20,}\b/g;
const UUID_PATTERN = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const PRIVATE_IPV4_PATTERN = /\b(?:10|127|192\.168|169\.254|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
// Loopback (::1), link-local (fe80::/10) and unique-local (fc00::/7, i.e. fc/fd prefixes)
// — the private/local IPv6 ranges, matched approximately (text redaction, not a strict
// parser) since this only ever runs as defense-in-depth alongside assertSafeUrl.
// `:` and `[`/`]` are never "word" characters, so `\b` can never anchor next to them —
// a `\b`-based version of this pattern silently never matches "::1" or "[::1]" at all
// (verified: both survived redaction before this fix). Lookaround on hex-digit-or-colon
// does the same job without relying on `\b`, and still lets brackets/whitespace/string
// boundaries delimit a match correctly.
const PRIVATE_IPV6_PATTERN = /(?<![0-9a-fA-F:])(?:::1|(?:fe80|fc[0-9a-f]{2}|fd[0-9a-f]{2}):[0-9a-fA-F:]*[0-9a-fA-F])(?![0-9a-fA-F:])/gi;
const INTERNAL_HOSTNAME_PATTERN = /\b(?:localhost(?::\d+)?|[a-z0-9-]+\.(?:local|internal|lan|corp|intranet))\b/gi;
const GENERIC_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;

// Redaction only — no truncation. Used before hashing, where truncating first would
// weaken the hash's ability to distinguish genuinely different content.
export function redactSensitivePatterns(input: string): string {
  return input
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(API_KEY_PATTERN, "[redacted-api-key]")
    .replace(UUID_PATTERN, "[redacted-uuid]")
    .replace(PRIVATE_IPV4_PATTERN, "[redacted-private-address]")
    .replace(PRIVATE_IPV6_PATTERN, "[redacted-private-address]")
    .replace(INTERNAL_HOSTNAME_PATTERN, "[redacted-internal-host]")
    .replace(GENERIC_TOKEN_PATTERN, "[redacted-token]");
}

export function sanitizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return sanitizeText(raw, 300);
  }
  url.hash = "";
  if (url.search) url.search = "?[redacted]";
  const sanitizedPath = url.pathname.length > 200 ? `${url.pathname.slice(0, 200)}…` : url.pathname;
  return redactSensitivePatterns(`${url.origin}${sanitizedPath}${url.search}`);
}

export function sanitizeText(raw: string, maxLength: number): string {
  const redacted = redactSensitivePatterns(raw);
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
}

export function hashContent(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Applied to the whole assembled evidence object immediately before Zod validation and
// persistence. Per-field sanitizer calls made during capture remain as defense-in-depth
// — this is the single point every path must pass through regardless of where it was
// captured, so a missed call site upstream doesn't leak unsanitized content.
export function sanitizeEvidenceV2(evidence: AuditEvidenceV2): AuditEvidenceV2 {
  const sanitizeBrowser = (browser: AuditEvidenceV2["desktop"]["browser"]) => ({
    ...browser,
    headline: browser.headline ? sanitizeText(browser.headline, 500) : browser.headline,
    headingHierarchy: browser.headingHierarchy.map((h) => ({ ...h, text: sanitizeText(h.text, 500) })),
    aboveFold: { ...browser.aboveFold, text: sanitizeText(browser.aboveFold.text, 5000), ctaTexts: browser.aboveFold.ctaTexts.map((t) => sanitizeText(t, 300)) },
    ctasVisible: browser.ctasVisible.map((c) => ({ ...c, text: sanitizeText(c.text, 300), href: sanitizeUrl(c.href) })),
    overlapCandidates: browser.overlapCandidates?.map((c) => ({ ...c, selector: sanitizeText(c.selector, 300), overlapsWithSelector: sanitizeText(c.overlapsWithSelector, 300) })) ?? null,
    smallTapTargetCandidates: browser.smallTapTargetCandidates?.map((c) => ({ ...c, selector: sanitizeText(c.selector, 300) })) ?? null,
    forms: browser.forms.map((f) => ({ action: sanitizeUrl(f.action), inputs: f.inputs.map((i) => ({ ...i, name: sanitizeText(i.name, 200) })) })),
    images: browser.images.map((img) => ({ ...img, src: sanitizeUrl(img.src) })),
    cookieBanner: { ...browser.cookieBanner, buttonsFound: browser.cookieBanner.buttonsFound.map((b) => sanitizeText(b, 200)) },
  });

  const sanitizeConsole = (consoleEvidence: AuditEvidenceV2["desktop"]["console"]) => ({
    consoleErrors: consoleEvidence.consoleErrors.map((e) => ({ ...e, message: sanitizeText(e.message, 500) })),
    pageErrors: consoleEvidence.pageErrors.map((e) => ({ ...e, message: sanitizeText(e.message, 500) })),
    failedRequests: consoleEvidence.failedRequests.map((r) => ({ ...r, url: sanitizeUrl(r.url), domain: sanitizeText(r.domain, 300), message: r.message ? sanitizeText(r.message, 300) : r.message })),
    limits: consoleEvidence.limits,
  });

  const sanitizeCta = (journeys: AuditEvidenceV2["desktop"]["ctaJourneys"]) =>
    journeys?.map((j) => ({
      ...j,
      text: sanitizeText(j.text, 300),
      locator: sanitizeText(j.locator, 300),
      declaredUrl: sanitizeUrl(j.declaredUrl),
      finalUrl: j.finalUrl ? sanitizeUrl(j.finalUrl) : j.finalUrl,
      error: j.error ? sanitizeText(j.error, 300) : j.error,
      skippedReason: j.skippedReason ? sanitizeText(j.skippedReason, 300) : j.skippedReason,
    })) ?? null;

  const sanitizeAccessibilityAudits = (audits: AuditEvidenceV2["accessibility"]["desktop"]["automatedChecks"]["failedAudits"]) =>
    audits.map((a) => ({ ...a, title: sanitizeText(a.title, 300), impact: a.impact ? sanitizeText(a.impact, 50) : a.impact }));

  return {
    ...evidence,
    methodology: {
      ...evidence.methodology,
      requestedUrl: sanitizeUrl(evidence.methodology.requestedUrl),
      finalUrl: sanitizeUrl(evidence.methodology.finalUrl),
      pageGoal: sanitizeText(evidence.methodology.pageGoal, 500),
      redirects: evidence.methodology.redirects.map((r) => ({ from: sanitizeUrl(r.from), to: sanitizeUrl(r.to), status: r.status })),
      tests: evidence.methodology.tests.map((t) => (t.reason ? { ...t, reason: sanitizeText(t.reason, 500) } : t)),
      limitations: evidence.methodology.limitations.map((l) => sanitizeText(l, 300)),
    },
    seo: {
      ...evidence.seo,
      title: sanitizeText(evidence.seo.title, 500),
      metaDescription: evidence.seo.metaDescription ? sanitizeText(evidence.seo.metaDescription, 1000) : evidence.seo.metaDescription,
      canonical: evidence.seo.canonical ? sanitizeUrl(evidence.seo.canonical) : evidence.seo.canonical,
      robotsMeta: evidence.seo.robotsMeta ? sanitizeText(evidence.seo.robotsMeta, 300) : evidence.seo.robotsMeta,
      xRobotsTag: evidence.seo.xRobotsTag ? sanitizeText(evidence.seo.xRobotsTag, 300) : evidence.seo.xRobotsTag,
      htmlLang: evidence.seo.htmlLang ? sanitizeText(evidence.seo.htmlLang, 50) : evidence.seo.htmlLang,
      viewportMeta: evidence.seo.viewportMeta ? sanitizeText(evidence.seo.viewportMeta, 300) : evidence.seo.viewportMeta,
      headings: evidence.seo.headings.map((h) => ({ ...h, text: sanitizeText(h.text, 500) })),
      hreflang: evidence.seo.hreflang.map((h) => ({ ...h, lang: sanitizeText(h.lang, 50), href: sanitizeUrl(h.href) })),
      openGraph: evidence.seo.openGraph.map((og) => ({ ...og, property: sanitizeText(og.property, 100), content: sanitizeText(og.content, 1000) })),
      jsonLd: evidence.seo.jsonLd.map((j) => ({
        ...j,
        types: j.types.map((t) => sanitizeText(t, 100)),
        sanitizedExcerpt: j.sanitizedExcerpt ? sanitizeText(j.sanitizedExcerpt, 400) : j.sanitizedExcerpt,
        parseError: j.parseError ? sanitizeText(j.parseError, 300) : j.parseError,
      })),
      links: evidence.seo.links.map((l) => ({ ...l, text: sanitizeText(l.text, 300), href: sanitizeUrl(l.href) })),
      pageStatus: { ...evidence.seo.pageStatus, redirectChain: evidence.seo.pageStatus.redirectChain.map((r) => ({ from: sanitizeUrl(r.from), to: sanitizeUrl(r.to), status: r.status })) },
    },
    desktop: { browser: sanitizeBrowser(evidence.desktop.browser), console: sanitizeConsole(evidence.desktop.console), ctaJourneys: sanitizeCta(evidence.desktop.ctaJourneys) },
    mobile: { browser: sanitizeBrowser(evidence.mobile.browser), console: sanitizeConsole(evidence.mobile.console), ctaJourneys: sanitizeCta(evidence.mobile.ctaJourneys) },
    accessibility: {
      ...evidence.accessibility,
      desktop: { ...evidence.accessibility.desktop, automatedChecks: { ...evidence.accessibility.desktop.automatedChecks, failedAudits: sanitizeAccessibilityAudits(evidence.accessibility.desktop.automatedChecks.failedAudits) } },
      mobile: { ...evidence.accessibility.mobile, automatedChecks: { ...evidence.accessibility.mobile.automatedChecks, failedAudits: sanitizeAccessibilityAudits(evidence.accessibility.mobile.automatedChecks.failedAudits) } },
    },
  };
}
