import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright";
import { assertSafeUrl } from "@/lib/security/url";
import type { ExtractedPage } from "@/lib/audit/types";
import type { BrowserEvidence, CookieBannerEvidence, ConsoleNetworkEvidence, CtaInteraction, CtaJourneyEvidence, CtaOutcome, EvidenceStatus, JsonLdEvidence, SeoEvidence, TestExecutionRecord } from "@/lib/audit/evidence-types";
import { hashContent, redactSensitivePatterns, sanitizeText, sanitizeUrl } from "@/lib/audit/evidence-sanitize";
import { dedupeEvidenceIds, makeEvidenceId } from "@/lib/audit/evidence-id";
import { deriveLegacyCookieBanner, deriveLegacyCtaJourneys } from "@/lib/audit/evidence-legacy";

export function clearScreenshotBuffer<T extends { buffer?: Buffer }>(entry: T): void {
  entry.buffer = undefined;
}

export function clearCookieBannerBuffers(screenshots: BrowserScanResult["cookieBannerScreenshots"]): void {
  screenshots.desktop.before = undefined;
  screenshots.desktop.after = undefined;
  screenshots.mobile.before = undefined;
  screenshots.mobile.after = undefined;
}

export interface BrowserScanResult {
  page: ExtractedPage;
  desktopScreenshot: Buffer;
  mobileScreenshot: Buffer;
  ctaScreenshots: { evidenceId: string; buffer: Buffer }[];
  cookieBannerScreenshots: { desktop: { before?: Buffer; after?: Buffer }; mobile: { before?: Buffer; after?: Buffer } };
  evidenceParts: {
    seo: SeoEvidence;
    desktop: { browser: BrowserEvidence; console: ConsoleNetworkEvidence; ctaJourneys: CtaJourneyEvidence[] };
    mobile: { browser: BrowserEvidence; console: ConsoleNetworkEvidence };
    tests: TestExecutionRecord[];
    redirects: { from: string; to: string; status: number }[];
    userAgentDesktop: string;
    userAgentMobile: string;
  };
}

const COOKIE_CONSENT_PATTERNS = [/accept all/i, /accept cookies/i, /^accept$/i, /i accept/i, /^agree$/i, /i agree/i, /got it/i, /allow all/i, /accetta tutto/i, /^accetta$/i, /acconsento/i, /consenti tutto/i, /ho capito/i];

const MAX_SCREENSHOT_BYTES = 3_000_000;

function capScreenshot(buffer: Buffer): Buffer | undefined {
  return buffer.length <= MAX_SCREENSHOT_BYTES ? buffer : undefined;
}

async function secureContext(context: BrowserContext) {
  // tsx/esbuild always compiles this project with keepNames enabled, which wraps named
  // functions declared inside page.evaluate() callbacks in a __name(fn, "name") helper call.
  // That helper only exists in the Node module scope, not in the page's isolated browser
  // realm, so evaluate() throws "__name is not defined" unless we shim it here first.
  await context.addInitScript(() => { (window as unknown as { __name?: (fn: unknown, name?: string) => unknown }).__name ??= (fn: unknown) => fn; });
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (!requestUrl.startsWith("http:") && !requestUrl.startsWith("https:")) return route.continue();
    try {
      await assertSafeUrl(requestUrl);
      await route.continue();
    } catch { await route.abort("blockedbyclient"); }
  });
}

async function settle(page: Page, url: string): Promise<Response | null> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  return response;
}

async function extract(page: Page): Promise<ExtractedPage> {
  return page.evaluate(() => {
    const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const text = clean(document.body.innerText).slice(0, 30_000);
    const headings = [...document.querySelectorAll("h1,h2,h3")].filter(visible).map((node) => ({ level: Number(node.tagName[1]), text: clean(node.textContent) })).filter((item) => item.text).slice(0, 80);
    const ctaNodes = [...document.querySelectorAll("button,a[href]")].filter(visible).filter((node) => {
      const content = clean(node.textContent).toLowerCase();
      const role = node.getAttribute("role");
      return node.tagName === "BUTTON" || role === "button" || /get started|start|buy|book|contact|demo|try|sign up|subscribe|learn more|scopri|inizia|contatt|acquista|prova/.test(content);
    });
    const ctas = ctaNodes.map((node) => ({ text: clean(node.textContent), href: node instanceof HTMLAnchorElement ? node.href : "", tag: node.tagName.toLowerCase() })).filter((item) => item.text).slice(0, 50);
    const links = [...document.querySelectorAll("a[href]")].filter(visible).map((node) => ({ text: clean(node.textContent), href: (node as HTMLAnchorElement).href })).slice(0, 150);
    const forms = [...document.forms].map((form) => ({ action: form.action, inputs: [...form.elements].map((field) => (field as HTMLInputElement).name || (field as HTMLInputElement).type).filter(Boolean).slice(0, 30) })).slice(0, 20);
    const foldNodes = [...document.querySelectorAll("body *")].filter((node) => { const rect = node.getBoundingClientRect(); return visible(node) && rect.top >= 0 && rect.top < window.innerHeight && node.children.length === 0; });
    const aboveText = clean(foldNodes.map((node) => node.textContent).join(" ")).slice(0, 5000);
    const aboveCtas = ctaNodes.filter((node) => node.getBoundingClientRect().top < window.innerHeight).map((node) => clean(node.textContent)).filter(Boolean);
    const trustPatterns = [/testimonial/i, /review/i, /trusted by/i, /customers?/i, /privacy/i, /refund/i, /guarantee/i, /rating/i, /certif/i, /clienti/i, /recension/i];
    const trustSignals = trustPatterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source.replace(/[?\\]/g, ""));
    return {
      url: location.href,
      title: document.title,
      metaDescription: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      headings,
      visibleText: text,
      ctas,
      ctaJourneys: [],
      links,
      forms,
      aboveFold: { text: aboveText, ctas: aboveCtas, imageCount: [...document.images].filter((image) => image.getBoundingClientRect().top < window.innerHeight).length },
      landmarks: { hasNav: Boolean(document.querySelector("nav")), hasFooter: Boolean(document.querySelector("footer")), hasMain: Boolean(document.querySelector("main")) },
      trustSignals,
      domSummary: { elements: document.querySelectorAll("*").length, images: document.images.length, buttons: document.querySelectorAll("button").length, links: document.links.length, forms: document.forms.length },
      cookieBanner: { detected: false, dismissed: false },
    };
  });
}

async function extractEvidence(page: Page, viewport: "desktop" | "mobile"): Promise<BrowserEvidence> {
  const GEOMETRY_TIME_BUDGET_MS = 2000;
  const geometry = await page.evaluate((budgetMs: number) => {
    const start = performance.now();
    const timeLeft = () => performance.now() - start < budgetMs;
    const rects = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    const hasHorizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const describeSelector = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`;

    const overlapCandidates: { selector: string; overlapsWithSelector: string; issue: "cutoff" | "overlap"; boundingBox: { x: number; y: number; width: number; height: number } }[] = [];
    for (const a of rects.slice(0, 400)) {
      if (!timeLeft() || overlapCandidates.length >= 30) break;
      const aRect = a.getBoundingClientRect();
      const parent = a.parentElement;
      if (parent) {
        const pRect = parent.getBoundingClientRect();
        if (aRect.right > pRect.right + 2 || aRect.bottom > pRect.bottom + 2) {
          overlapCandidates.push({ selector: describeSelector(a), overlapsWithSelector: describeSelector(parent), issue: "cutoff", boundingBox: { x: aRect.x, y: aRect.y, width: aRect.width, height: aRect.height } });
        }
      }
    }

    const smallTapTargetCandidates: { selector: string; boundingBox: { x: number; y: number; width: number; height: number }; widthPx: number; heightPx: number }[] = [];
    const interactive = rects.filter((el) => el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.tagName === "INPUT");
    for (const el of interactive.slice(0, 200)) {
      if (!timeLeft() || smallTapTargetCandidates.length >= 30) break;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) smallTapTargetCandidates.push({ selector: describeSelector(el), boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height }, widthPx: Math.round(r.width), heightPx: Math.round(r.height) });
    }

    const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (el: Element) => rects.includes(el);
    const headingHierarchy = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((node) => ({ level: Number(node.tagName[1]), text: clean(node.textContent) })).filter((item) => item.text).slice(0, 80);
    const headline = headingHierarchy.find((h) => h.level === 1)?.text ?? headingHierarchy[0]?.text ?? null;
    const ctaNodes = [...document.querySelectorAll("button,a[href]")].filter(visible);
    const ctasVisible = ctaNodes.map((node) => ({ text: clean(node.textContent), href: node instanceof HTMLAnchorElement ? node.href : "", tag: node.tagName.toLowerCase(), position: (node.getBoundingClientRect().top < window.innerHeight ? "above-fold" : "below-fold") as "above-fold" | "below-fold" })).filter((c) => c.text).slice(0, 50);
    const foldNodes = rects.filter((node) => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight && node.children.length === 0; });
    const aboveFoldText = clean(foldNodes.map((n) => n.textContent).join(" ")).slice(0, 5000);
    const aboveFoldCtas = ctasVisible.filter((c) => c.position === "above-fold").map((c) => c.text);
    const imageCount = [...document.images].filter((img) => img.getBoundingClientRect().top < window.innerHeight).length;
    const forms = [...document.forms].map((form) => ({
      action: form.action,
      inputs: [...form.elements].map((field) => {
        const input = field as HTMLInputElement;
        const hasLabel = Boolean(input.labels?.length) || Boolean(input.getAttribute("aria-label")) || Boolean(input.getAttribute("aria-labelledby"));
        return { name: input.name || "", type: input.type || input.tagName.toLowerCase(), hasLabel };
      }).slice(0, 30),
    })).slice(0, 20);
    const images = [...document.images].slice(0, 50).map((img) => ({ src: img.src, hasAlt: img.alt.trim().length > 0, aboveFold: img.getBoundingClientRect().top < window.innerHeight }));

    return {
      hasHorizontalOverflow,
      overlapCandidates,
      smallTapTargetCandidates,
      headline,
      headingHierarchy,
      ctasVisible,
      navPresent: Boolean(document.querySelector("nav")),
      aboveFold: { text: aboveFoldText, ctas: aboveFoldCtas, imageCount },
      forms,
      landmarks: { hasNav: Boolean(document.querySelector("nav")), hasFooter: Boolean(document.querySelector("footer")), hasMain: Boolean(document.querySelector("main")) },
      images,
    };
  }, GEOMETRY_TIME_BUDGET_MS);

  return {
    viewport,
    headline: geometry.headline,
    headingHierarchy: geometry.headingHierarchy,
    aboveFold: { text: geometry.aboveFold.text, ctaTexts: geometry.aboveFold.ctas, imageCount: geometry.aboveFold.imageCount },
    ctasVisible: geometry.ctasVisible,
    navPresent: geometry.navPresent,
    hasHorizontalOverflow: geometry.hasHorizontalOverflow,
    // Geometry itself is "verified" — it was measured. Whether a candidate represents a
    // real problem is always "inferred": an overlay can be intentional, a small target
    // can satisfy one of WCAG 2.5.8's five exceptions. Never claim "verified" on the
    // conclusion, only on the fact that the scan ran.
    overlapCandidates: dedupeEvidenceIds(geometry.overlapCandidates.map((c) => ({ ...c, evidenceId: makeEvidenceId("overlap", viewport, c.selector, c.issue), status: "inferred" as const }))),
    overlapCandidatesStatus: "verified",
    smallTapTargetCandidates: viewport === "mobile" ? dedupeEvidenceIds(geometry.smallTapTargetCandidates.map((c) => ({ ...c, evidenceId: makeEvidenceId("tap-target", viewport, c.selector), status: "inferred" as const }))) : null,
    smallTapTargetCandidatesStatus: viewport === "mobile" ? "verified" : "not-assessed",
    forms: geometry.forms,
    landmarks: geometry.landmarks,
    images: geometry.images,
    cookieBanner: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] },
  };
}

async function detectAndDismissCookieBanner(page: Page): Promise<{ evidence: CookieBannerEvidence; beforeScreenshot?: Buffer; afterScreenshot?: Buffer }> {
  const detection = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("[class*=cookie i],[id*=cookie i],[class*=consent i],[id*=consent i],[role=dialog]")];
    const banner = candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    if (!banner) return { detected: false, buttonsFound: [] as string[], blocking: null as boolean | null };
    const buttons = [...banner.querySelectorAll("button,a[role=button],a")].map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 10);
    const style = window.getComputedStyle(banner);
    const rect = banner.getBoundingClientRect();
    const coversMost = rect.width >= window.innerWidth * 0.6 && rect.height >= window.innerHeight * 0.6;
    const isFixedOrSticky = style.position === "fixed" || style.position === "sticky";
    const bodyLocked = window.getComputedStyle(document.body).overflow === "hidden";
    return { detected: true, buttonsFound: buttons, blocking: (coversMost && isFixedOrSticky) || bodyLocked };
  });

  // Screenshots are captured only when a banner was actually detected — never
  // speculatively, and never for a page with no banner at all.
  if (!detection.detected) {
    return { evidence: { detected: false, dismissAttempted: false, dismissed: false, blocking: null, blockingStatus: "not-assessed", buttonsFound: [] } };
  }

  let beforeScreenshot: Buffer | undefined;
  try { beforeScreenshot = capScreenshot(Buffer.from(await page.screenshot({ type: "jpeg", quality: 70 }))); } catch { /* screenshot best-effort */ }

  // A click that doesn't throw only proves the click was dispatched, not that it actually
  // closed anything (a decoy "Accept" that toggles unrelated state would otherwise be
  // reported as a false dismissed=true). Verify the banner is genuinely gone/hidden after
  // each attempt, and keep trying other candidate buttons if it isn't.
  let dismissAttempted = false;
  let dismissed = false;
  for (const pattern of COOKIE_CONSENT_PATTERNS) {
    if (dismissed) break;
    const button = page.getByRole("button", { name: pattern }).first();
    try {
      if (await button.isVisible({ timeout: 400 })) {
        await button.click({ timeout: 1500 });
        dismissAttempted = true;
        await page.waitForTimeout(400);
        dismissed = !(await isCookieBannerVisible(page));
      }
    } catch { /* pattern not present or not clickable, try the next one */ }
  }

  let afterScreenshot: Buffer | undefined;
  try { afterScreenshot = capScreenshot(Buffer.from(await page.screenshot({ type: "jpeg", quality: 70 }))); } catch { /* screenshot best-effort */ }

  return {
    evidence: {
      detected: true,
      dismissAttempted,
      dismissed,
      blocking: detection.blocking,
      blockingStatus: detection.blocking === null ? "not-assessed" : "verified",
      buttonsFound: detection.buttonsFound,
    },
    beforeScreenshot,
    afterScreenshot,
  };
}

async function isCookieBannerVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll("[class*=cookie i],[id*=cookie i],[class*=consent i],[id*=consent i],[role=dialog]")];
    return candidates.some((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
  });
}

async function countRedirects(response: Response | null): Promise<number> {
  let count = 0;
  let current = response?.request().redirectedFrom() ?? null;
  while (current) { count += 1; current = current.redirectedFrom(); }
  return count;
}

function isSafetyBlock(message: string): boolean {
  // Chromium's actual abort reason is "net::ERR_BLOCKED_BY_CLIENT" (underscored) — match
  // it with a permissive separator so both that and a hypothetical unspaced variant hit.
  return /blocked.by.client|private network|resolves to a private|cannot be audited|could not be resolved/i.test(message);
}

interface RawCtaCandidate {
  tag: string;
  role: string | null;
  text: string;
  type: string | null;
  href: string;
  stateChanging: boolean;
  groupKey: string;
  groupIndex: number;
  groupSize: number;
}

// Runs on the already-settled, cookie-dismissed desktop page. Every element that could
// plausibly be a conversion action — not just ones matching marketing-copy keywords, so a
// bare `<button type="submit">Save</button>` is still captured and correctly routed to
// skipped-potentially-state-changing rather than silently dropped.
async function extractCtaCandidates(page: Page): Promise<RawCtaCandidate[]> {
  return page.evaluate(() => {
    const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const STATE_CHANGING = /\b(submit|checkout|buy now|purchase|pay|delete|remove|logout|log out|sign out|unsubscribe|cancel|place order|confirm order|delete account)\b/i;
    const CTA_KEYWORDS = /get started|start|buy|book|contact|demo|try|sign up|subscribe|learn more|scopri|inizia|contatt|acquista|prova|save|accept/i;

    const nodes = [...document.querySelectorAll('button,a[href],input[type="submit"],input[type="button"],[role="button"]')].filter(visible);
    const raw = nodes
      .map((node) => {
        const tag = node.tagName.toLowerCase();
        const role = node.getAttribute("role");
        const isInput = tag === "input";
        const text = isInput ? clean((node as HTMLInputElement).value) : clean(node.textContent);
        const explicitType = node.getAttribute("type");
        const insideForm = Boolean(node.closest("form"));
        const resolvedType = isInput ? (explicitType ?? "text") : tag === "button" ? (explicitType ?? (insideForm ? "submit" : "button")) : null;
        const isFormSubmit = resolvedType === "submit" && insideForm;
        const href = node instanceof HTMLAnchorElement ? node.href : "";
        const stateChanging = isFormSubmit || STATE_CHANGING.test(text);
        const isCtaLike = tag === "button" || tag === "input" || role === "button" || CTA_KEYWORDS.test(text) || isFormSubmit;
        return { tag, role, text, type: resolvedType, href, stateChanging, isCtaLike };
      })
      .filter((c) => c.isCtaLike && c.text)
      .slice(0, 50);

    const counts = new Map<string, number>();
    for (const c of raw) { const key = `${c.tag}::${c.text}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
    const running = new Map<string, number>();
    return raw.map((c) => {
      const groupKey = `${c.tag}::${c.text}`;
      const groupIndex = running.get(groupKey) ?? 0;
      running.set(groupKey, groupIndex + 1);
      return { tag: c.tag, role: c.role, text: c.text, type: c.type, href: c.href, stateChanging: c.stateChanging, groupKey, groupIndex, groupSize: counts.get(groupKey) ?? 1 };
    });
  });
}

interface ClassifiedCtaCandidate extends RawCtaCandidate {
  kind: "anchor" | "button";
  declaredUrl: string;
  sameOrigin: boolean;
  validProtocol: boolean;
}

interface ClickTestResult {
  outcome: CtaOutcome;
  interaction: CtaInteraction;
  finalUrl?: string;
  redirectCount?: number;
  httpStatus?: number;
  error?: string;
  skippedReason?: string;
  screenshot?: Buffer;
}

function attachRedirectGuard(page: Page, onBlocked: () => void): void {
  // Secondary, faster-acting signal only: the ACTUAL block is context.route()'s
  // assertSafeUrl-gated route.continue(), applied at the BrowserContext level to every
  // page (present and future, including popups) sharing this context — that is what
  // keeps the request from ever being dispatched. This listener just inspects each 3xx
  // response's Location header the moment headers arrive and force-closes the page,
  // so classification doesn't have to wait out a full navigation timeout if the
  // underlying abort takes a moment to propagate.
  page.on("response", (response) => {
    const status = response.status();
    if (status < 300 || status >= 400) return;
    const location = response.headers()["location"];
    if (!location) return;
    let target: URL;
    try { target = new URL(location, response.url()); } catch { return; }
    assertSafeUrl(target.toString()).catch(() => {
      onBlocked();
      page.close().catch(() => { /* page may already be closing */ });
    });
  });
}

interface ThrowawayContextOptions {
  viewport: { width: number; height: number };
  userAgent: string;
}

async function followDeclaredUrlFallback(browser: Browser, contextOptions: ThrowawayContextOptions, candidate: ClassifiedCtaCandidate, cause: unknown): Promise<ClickTestResult> {
  const causeMessage = cause instanceof Error ? cause.message : "Could not perform a real click";
  if (candidate.kind !== "anchor") {
    // A button has no declared href — there is nothing to "follow declared URL" to, so
    // this must not be reported as followed-declared-url (nothing was followed) or as
    // network-error (no navigation was even attempted). It is honestly untested.
    return {
      outcome: "skipped-unactionable",
      interaction: "not-tested",
      skippedReason: sanitizeText(`Could not click this element and it has no declared destination to verify directly: ${causeMessage}`, 300),
    };
  }
  const throwaway = await browser.newContext(contextOptions);
  await secureContext(throwaway);
  const probe = await throwaway.newPage();
  let blockedByGuard = false;
  attachRedirectGuard(probe, () => { blockedByGuard = true; });
  try {
    const response = await probe.goto(candidate.declaredUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await assertSafeUrl(probe.url());
    const redirectCount = await countRedirects(response);
    const outcome: CtaOutcome = !response ? "network-error" : !response.ok() ? "http-error" : redirectCount > 0 ? "redirected" : "navigated";
    const screenshot = response?.ok() ? Buffer.from(await probe.screenshot({ type: "jpeg", quality: 70 })) : undefined;
    return { outcome, interaction: "followed-declared-url", finalUrl: probe.url(), redirectCount, httpStatus: response?.status(), error: outcome === "network-error" ? "No response received" : undefined, screenshot };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load";
    if (blockedByGuard || isSafetyBlock(message)) {
      return { outcome: "blocked-unsafe-redirect", interaction: "followed-declared-url", error: "Blocked: navigation to a private/unsafe address was prevented" };
    }
    return { outcome: "network-error", interaction: "followed-declared-url", error: message.slice(0, 300) };
  } finally {
    await throwaway.close().catch(() => { /* may already be closed by the guard above */ });
  }
}

// Re-identifies the candidate on a *fresh* load of the source page (never the page it was
// originally observed on) and, only if uniquely re-identifiable, performs a genuine
// Playwright click and observes what actually happens — same-tab navigation, a new
// popup/tab, client-side (History API) routing, or nothing at all. Never infers a
// navigation outcome purely from the declared href.
//
// Runs in its own disposable BrowserContext (not just a new page in a shared one): CTA
// tests run concurrently (Promise.all in testCtaJourneysEvidence below), and
// BrowserContext's "page" event fires for every new page created anywhere in that
// context — a shared context would let one test's popup-detection listener catch
// another concurrently-running test's own probe, corrupting both. A fresh context per
// test keeps every test's event namespace, and therefore its popup detection, isolated.
async function performClickTest(browser: Browser, contextOptions: ThrowawayContextOptions, sourceUrl: string, candidate: ClassifiedCtaCandidate): Promise<ClickTestResult> {
  const throwaway = await browser.newContext(contextOptions);
  await secureContext(throwaway);
  const probe = await throwaway.newPage();
  let blockedByGuard = false;
  attachRedirectGuard(probe, () => { blockedByGuard = true; });

  // A plain `let` mutated only inside the "page" listener would leave TypeScript unable to
  // re-narrow reads made after this point in the outer function, so track the popup (if
  // any) through a ref object instead.
  const popupRef: { current: Page | null } = { current: null };
  const popupResponses: Response[] = [];
  const onNewPage = (created: Page) => {
    if (popupRef.current) return;
    popupRef.current = created;
    attachRedirectGuard(created, () => { blockedByGuard = true; });
    created.on("response", (r) => { if (r.request().isNavigationRequest() && r.frame() === created.mainFrame()) popupResponses.push(r); });
  };
  throwaway.on("page", onNewPage);

  try {
    await probe.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await probe.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
    await detectAndDismissCookieBanner(probe).catch(() => undefined);

    const arrayHandle = await probe.evaluateHandle((groupKey: string) => {
      const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const nodes = [...document.querySelectorAll('button,a[href],input[type="submit"],input[type="button"],[role="button"]')].filter(visible);
      return nodes.filter((node) => {
        const tag = node.tagName.toLowerCase();
        const text = tag === "input" ? clean((node as HTMLInputElement).value) : clean(node.textContent);
        return `${tag}::${text}` === groupKey;
      });
    }, candidate.groupKey);
    const matchCount: number = await arrayHandle.evaluate((arr) => arr.length);
    const ambiguousReason = "Could not uniquely re-identify this element on a fresh page load";
    if (matchCount !== candidate.groupSize || candidate.groupIndex >= matchCount) {
      await arrayHandle.dispose();
      return { outcome: "skipped-ambiguous-locator", interaction: "not-tested", skippedReason: ambiguousReason };
    }
    const elementHandle = (await arrayHandle.getProperty(String(candidate.groupIndex))).asElement();
    await arrayHandle.dispose();
    if (!elementHandle) return { outcome: "skipped-ambiguous-locator", interaction: "not-tested", skippedReason: ambiguousReason };

    // isNavigationRequest() excludes fetch/XHR/image/other subresource requests the click
    // might trigger — a button that only calls fetch() must never be misclassified as a
    // navigation just because a response happened to arrive on the main frame.
    const mainResponses: Response[] = [];
    probe.on("response", (r) => { if (r.request().isNavigationRequest() && r.frame() === probe.mainFrame()) mainResponses.push(r); });
    const urlBefore = probe.url();

    try {
      await elementHandle.click({ timeout: 5_000 });
    } catch (clickError) {
      // The element could not actually be clicked (covered, detached, unactionable) — a
      // real click never happened, so this must never be reported to the user as "clicked".
      return await followDeclaredUrlFallback(browser, contextOptions, candidate, clickError);
    }

    await probe.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    if (popupRef.current) await popupRef.current.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);

    if (blockedByGuard) {
      return { outcome: "blocked-unsafe-redirect", interaction: "clicked", error: "Blocked: navigation to a private/unsafe address was prevented" };
    }

    const targetPage = popupRef.current ?? probe;
    await assertSafeUrl(targetPage.url());
    const responses = popupRef.current ? popupResponses : mainResponses;
    const finalResponse = responses.length ? responses[responses.length - 1] : null;

    if (!popupRef.current && !finalResponse && targetPage.url() === urlBefore) {
      // A real click was dispatched but produced no page navigation whatsoever — e.g. a
      // decorative button, one that only calls fetch(), or one that opens a modal /
      // expands an accordion / otherwise changes in-page state. This is what replaces the
      // old (buggy) behavior of treating a href-less button as "navigated" to the
      // homepage. A screenshot is still captured — the lack of navigation says nothing
      // about whether the click produced a visible in-page change (a modal, a state
      // toggle), which the screenshot can still show.
      const screenshot = Buffer.from(await targetPage.screenshot({ type: "jpeg", quality: 70 }));
      return { outcome: "no-navigation", interaction: "clicked", screenshot };
    }

    const redirectCount = await countRedirects(finalResponse);
    const outcome: CtaOutcome = finalResponse && !finalResponse.ok() ? "http-error" : redirectCount > 0 ? "redirected" : "navigated";
    const screenshot = !finalResponse || finalResponse.ok() ? Buffer.from(await targetPage.screenshot({ type: "jpeg", quality: 70 })) : undefined;
    return { outcome, interaction: "clicked", finalUrl: targetPage.url(), redirectCount, httpStatus: finalResponse?.status(), screenshot };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load";
    if (blockedByGuard || isSafetyBlock(message)) {
      return { outcome: "blocked-unsafe-redirect", interaction: "clicked", error: "Blocked: navigation to a private/unsafe address was prevented" };
    }
    return { outcome: "network-error", interaction: "clicked", error: message.slice(0, 300) };
  } finally {
    throwaway.off("page", onNewPage);
    await throwaway.close().catch(() => { /* may already be closed by the guard above */ });
  }
}

async function testCtaJourneysEvidence(browser: Browser, contextOptions: ThrowawayContextOptions, sourceUrl: string, candidates: RawCtaCandidate[]): Promise<{ evidence: CtaJourneyEvidence; screenshot?: Buffer }[]> {
  const source = new URL(sourceUrl);

  const classified: ClassifiedCtaCandidate[] = candidates.map((c) => {
    const kind: "anchor" | "button" = c.tag === "a" ? "anchor" : "button";
    if (kind !== "anchor") return { ...c, kind, declaredUrl: sourceUrl, sameOrigin: true, validProtocol: true };
    try {
      const resolved = new URL(c.href, source);
      return { ...c, kind, declaredUrl: resolved.toString(), sameOrigin: resolved.origin === source.origin, validProtocol: resolved.protocol === "http:" || resolved.protocol === "https:" };
    } catch {
      return { ...c, kind, declaredUrl: c.href, sameOrigin: false, validProtocol: false };
    }
  });

  const makeBase = (c: ClassifiedCtaCandidate) => ({
    evidenceId: makeEvidenceId("cta", c.tag, c.text, String(c.groupIndex), c.declaredUrl),
    text: c.text,
    element: c.tag,
    role: c.role,
    type: c.type,
    locator: `${c.tag}[${c.groupIndex + 1} of ${c.groupSize} matching "${c.text}"]`,
    declaredUrl: c.declaredUrl,
    sameOrigin: c.sameOrigin,
  });

  type Bucket = "invalid-url" | "external" | "state-changing" | "eligible";
  const bucketOf = (c: ClassifiedCtaCandidate): Bucket => {
    if (c.kind === "anchor" && !c.validProtocol) return "invalid-url";
    if (c.kind === "anchor" && !c.sameOrigin) return "external";
    if (c.stateChanging) return "state-changing";
    return "eligible";
  };
  const byBucket = new Map<Bucket, ClassifiedCtaCandidate[]>([["invalid-url", []], ["external", []], ["state-changing", []], ["eligible", []]]);
  for (const c of classified) byBucket.get(bucketOf(c))!.push(c);

  const eligible = byBucket.get("eligible")!;
  const tested = eligible.slice(0, 5);
  const overLimit = eligible.slice(5);

  const testedResults = await Promise.all(tested.map(async (c) => {
    const result = await performClickTest(browser, contextOptions, sourceUrl, c);
    return {
      evidence: {
        ...makeBase(c),
        interaction: result.interaction,
        navigationAttempted: result.interaction !== "not-tested",
        finalUrl: result.finalUrl,
        redirectCount: result.redirectCount,
        httpStatus: result.httpStatus,
        outcome: result.outcome,
        error: result.error,
        skippedReason: result.skippedReason,
      },
      screenshot: result.screenshot,
    };
  }));

  const externalResults = byBucket.get("external")!.map((c) => ({ evidence: { ...makeBase(c), interaction: "not-tested" as const, navigationAttempted: false, outcome: "external-not-visited" as const, skippedReason: "External destination — not navigated in this audit" } }));
  const stateChangingResults = byBucket.get("state-changing")!.map((c) => ({ evidence: { ...makeBase(c), interaction: "not-tested" as const, navigationAttempted: false, outcome: "skipped-potentially-state-changing" as const, skippedReason: "Potentially state-changing action (submit/checkout/delete-like) — not clicked automatically" } }));
  const overLimitResults = overLimit.map((c) => ({ evidence: { ...makeBase(c), interaction: "not-tested" as const, navigationAttempted: false, outcome: "skipped-limit" as const, skippedReason: "Not tested — audit is capped at the first 5 conversion paths" } }));
  const invalidResults = byBucket.get("invalid-url")!.map((c) => ({ evidence: { ...makeBase(c), interaction: "not-tested" as const, navigationAttempted: false, outcome: "skipped-invalid-url" as const, skippedReason: "Not tested — not an http(s) destination" } }));

  const combined = [...testedResults, ...externalResults, ...stateChangingResults, ...overLimitResults, ...invalidResults];
  const dedupedEvidence = dedupeEvidenceIds(combined.map((r) => r.evidence));
  return combined.map((r, i) => ({ ...r, evidence: dedupedEvidence[i] }));
}

async function addAnnotations(page: Page, ctas: ExtractedPage["ctas"]) {
  await page.evaluate((ctaLabels) => {
    const targets = [document.querySelector("h1"), ...[...document.querySelectorAll("a,button")].filter((node) => ctaLabels.includes((node.textContent ?? "").replace(/\s+/g, " ").trim()))].filter(Boolean).slice(0, 6) as HTMLElement[];
    targets.forEach((target, index) => {
      target.style.outline = "3px solid #6356e8";
      target.style.outlineOffset = "4px";
      const marker = document.createElement("span");
      marker.textContent = String(index + 1);
      marker.setAttribute("data-lensiq-marker", "true");
      Object.assign(marker.style, { position: "absolute", zIndex: "2147483647", left: `${target.getBoundingClientRect().left + window.scrollX - 13}px`, top: `${target.getBoundingClientRect().top + window.scrollY - 13}px`, width: "26px", height: "26px", borderRadius: "999px", background: "#6356e8", color: "#ffffff", display: "grid", placeItems: "center", font: "700 12px Arial" });
      document.body.appendChild(marker);
    });
  }, ctas.map((cta) => cta.text));
}

async function extractSeoEvidence(page: Page, response: Response | null): Promise<SeoEvidence> {
  const raw = await page.evaluate(() => {
    const attr = (selector: string, name: string) => document.querySelector(selector)?.getAttribute(name) ?? null;
    return {
      canonical: attr('link[rel="canonical"]', "href"),
      robotsMeta: attr('meta[name="robots"]', "content"),
      htmlLang: document.documentElement.getAttribute("lang"),
      viewportMeta: attr('meta[name="viewport"]', "content"),
      hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((el) => ({ lang: el.getAttribute("hreflang") ?? "", href: (el as HTMLLinkElement).href })).slice(0, 50),
      openGraph: [...document.querySelectorAll('meta[property^="og:"]')].map((el) => ({ property: el.getAttribute("property") ?? "", content: el.getAttribute("content") ?? "" })).slice(0, 30),
      jsonLdScripts: [...document.querySelectorAll('script[type="application/ld+json"]')].map((el) => el.textContent ?? "").slice(0, 10),
      links: [...document.querySelectorAll("a[href]")].map((el) => ({ text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), href: (el as HTMLAnchorElement).href })).slice(0, 150),
      headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((el) => ({ level: Number(el.tagName[1]), text: (el.textContent ?? "").replace(/\s+/g, " ").trim() })).filter((h) => h.text).slice(0, 80),
      title: document.title,
      metaDescription: attr('meta[name="description"]', "content"),
      visibleText: (document.body.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 30_000),
    };
  });

  const matchableTypes = new Set(["Product", "Article"]);
  const jsonLd: JsonLdEvidence[] = raw.jsonLdScripts.map((script) => {
    // Redact BEFORE hashing/excerpting — the hash and excerpt must never be derivable
    // back to potentially sensitive raw content the page author embedded.
    const redactedScript = redactSensitivePatterns(script);
    const excerptHash = hashContent(redactedScript);
    const evidenceId = `jsonld:${excerptHash.slice(0, 12)}`;
    try {
      const parsedJson = JSON.parse(script) as Record<string, unknown> & { "@type"?: string | string[] };
      const types = Array.isArray(parsedJson["@type"]) ? (parsedJson["@type"] as string[]) : parsedJson["@type"] ? [parsedJson["@type"] as string] : [];
      const matchableType = types.find((t) => matchableTypes.has(t));
      let contentMatch: boolean | null = null;
      let contentMatchStatus: EvidenceStatus = "not-assessed";
      if (matchableType) {
        const nameField = (parsedJson.name ?? parsedJson.headline) as string | undefined;
        if (typeof nameField === "string" && nameField.trim()) {
          // A substring match is deterministic but not a robust semantic verification —
          // record it as "inferred", never "verified".
          contentMatch = raw.visibleText.includes(nameField.trim());
          contentMatchStatus = "inferred";
        }
      }
      return { evidenceId, parsed: true, types, excerptHash, sanitizedExcerpt: sanitizeText(redactedScript, 400), contentMatch, contentMatchStatus };
    } catch (error) {
      return { evidenceId, parsed: false, types: [], parseError: sanitizeText(error instanceof Error ? error.message : "Invalid JSON-LD", 300), excerptHash, contentMatch: null, contentMatchStatus: "not-assessed" as const };
    }
  });

  const redirectChain: { from: string; to: string; status: number }[] = [];
  let current = response?.request().redirectedFrom() ?? null;
  let previousUrl = response?.url();
  while (current && redirectChain.length < 20) {
    const currentResponse = await current.response();
    if (currentResponse && previousUrl) redirectChain.unshift({ from: sanitizeUrl(current.url()), to: sanitizeUrl(previousUrl), status: currentResponse.status() });
    previousUrl = current.url();
    current = current.redirectedFrom();
  }

  return {
    title: raw.title,
    metaDescription: raw.metaDescription,
    canonical: raw.canonical,
    robotsMeta: raw.robotsMeta,
    xRobotsTag: response?.headers()["x-robots-tag"] ?? null,
    htmlLang: raw.htmlLang,
    viewportMeta: raw.viewportMeta,
    headings: raw.headings,
    hreflang: dedupeEvidenceIds(raw.hreflang.map((h) => ({ evidenceId: makeEvidenceId("hreflang", h.lang, h.href), ...h }))),
    openGraph: dedupeEvidenceIds(raw.openGraph.map((og) => ({ evidenceId: makeEvidenceId("og", og.property, og.content), ...og }))),
    jsonLd,
    links: raw.links.map((link) => ({ text: link.text, href: sanitizeUrl(link.href), sameOrigin: (() => { try { return new URL(link.href).origin === new URL(raw.canonical ?? response?.url() ?? "").origin; } catch { return false; } })() })),
    pageStatus: { initialStatus: redirectChain[0]?.status ?? response?.status() ?? null, finalStatus: response?.status() ?? null, redirectChain },
  };
}

const MAX_CONSOLE_ERRORS = 20;
const MAX_FAILED_REQUESTS = 20;

function attachConsoleNetworkCapture(page: Page): () => ConsoleNetworkEvidence {
  const consoleErrors: { message: string; timestamp: string }[] = [];
  const pageErrors: { message: string; timestamp: string }[] = [];
  const failedRequests: { url: string; resourceType: string; domain: string; status: number | null; message?: string }[] = [];
  let truncated = false;

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (consoleErrors.length >= MAX_CONSOLE_ERRORS) { truncated = true; return; }
    consoleErrors.push({ message: sanitizeText(message.text(), 500), timestamp: new Date().toISOString() });
  });
  page.on("pageerror", (error) => {
    if (pageErrors.length >= MAX_CONSOLE_ERRORS) { truncated = true; return; }
    pageErrors.push({ message: sanitizeText(error.message, 500), timestamp: new Date().toISOString() });
  });
  page.on("requestfailed", (request) => {
    if (failedRequests.length >= MAX_FAILED_REQUESTS) { truncated = true; return; }
    let domain = "";
    try { domain = new URL(request.url()).hostname; } catch { /* ignore */ }
    failedRequests.push({ url: sanitizeUrl(request.url()), resourceType: request.resourceType(), domain, status: null, message: sanitizeText(request.failure()?.errorText ?? "Request failed", 300) });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (failedRequests.length >= MAX_FAILED_REQUESTS) { truncated = true; return; }
    let domain = "";
    try { domain = new URL(response.url()).hostname; } catch { /* ignore */ }
    failedRequests.push({ url: sanitizeUrl(response.url()), resourceType: response.request().resourceType(), domain, status: response.status() });
  });

  return () => ({
    consoleErrors: dedupe(consoleErrors).map((e) => ({ evidenceId: makeEvidenceId("console", e.message), ...e })),
    pageErrors: dedupe(pageErrors).map((e) => ({ evidenceId: makeEvidenceId("pageerror", e.message), ...e })),
    failedRequests: dedupeEvidenceIds(failedRequests.map((r) => ({ evidenceId: makeEvidenceId("network", r.url, r.resourceType), ...r }))),
    limits: { maxConsoleErrors: MAX_CONSOLE_ERRORS, maxFailedRequests: MAX_FAILED_REQUESTS, truncated },
  });
}

function dedupe<T extends { message: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.message) ? false : (seen.add(item.message), true)));
}

export async function scanHomepage(inputUrl: string): Promise<BrowserScanResult> {
  const url = await assertSafeUrl(inputUrl);
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const tests: TestExecutionRecord[] = [];
  const desktopUserAgent = "LensiqBot/0.1 (+https://lensiq.site/bot)";
  const mobileUserAgent = "LensiqBot/0.1 mobile (+https://lensiq.site/bot)";
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, userAgent: desktopUserAgent });
    await secureContext(desktop);
    const desktopPage = await desktop.newPage();
    const desktopConsoleCapture = attachConsoleNetworkCapture(desktopPage);
    let desktopResponse: Response | null = null;
    try {
      desktopResponse = await settle(desktopPage, url);
      tests.push({ id: "desktop-dom", status: "passed" });
    } catch (error) {
      tests.push({ id: "desktop-dom", status: "failed", reason: error instanceof Error ? error.message : "Navigation failed" });
      throw error;
    }
    await assertSafeUrl(desktopPage.url());
    const cookieDesktop = await detectAndDismissCookieBanner(desktopPage);
    tests.push({ id: "cookie-banner-desktop", status: "passed" });
    const pageData = await extract(desktopPage);
    pageData.cookieBanner = deriveLegacyCookieBanner(cookieDesktop.evidence);
    const desktopEvidenceBrowser = await extractEvidence(desktopPage, "desktop");
    desktopEvidenceBrowser.cookieBanner = cookieDesktop.evidence;

    // cta-journey-desktop failures are recorded but not rethrown — a broken
    // conversion-path check shouldn't fail an otherwise-complete audit. Contrast with
    // desktop-dom/seo-extraction below, which ARE foundational and do rethrow.
    let ctaResults: { evidence: CtaJourneyEvidence; screenshot?: Buffer }[] = [];
    try {
      const ctaCandidates = await extractCtaCandidates(desktopPage);
      ctaResults = await testCtaJourneysEvidence(browser, { viewport: { width: 1440, height: 1000 }, userAgent: desktopUserAgent }, pageData.url, ctaCandidates);
      tests.push({ id: "cta-journey-desktop", status: "passed" });
    } catch (error) {
      tests.push({ id: "cta-journey-desktop", status: "failed", reason: error instanceof Error ? error.message : "CTA journey testing failed" });
    }
    tests.push({ id: "cta-journey-mobile", status: "skipped", reason: "single-page audit tests conversion paths once, on desktop, to bound audit runtime" });
    pageData.ctaJourneys = deriveLegacyCtaJourneys(ctaResults.map((r) => r.evidence));
    const ctaScreenshots = ctaResults
      .map((result) => ({ evidenceId: result.evidence.evidenceId, buffer: result.screenshot }))
      .filter((entry): entry is { evidenceId: string; buffer: Buffer } => Boolean(entry.buffer));

    let seoEvidence: SeoEvidence;
    try {
      seoEvidence = await extractSeoEvidence(desktopPage, desktopResponse);
      tests.push({ id: "seo-extraction", status: "passed" });
    } catch (error) {
      tests.push({ id: "seo-extraction", status: "failed", reason: error instanceof Error ? error.message : "SEO extraction failed" });
      throw error;
    }

    const desktopConsoleNetwork = desktopConsoleCapture();
    tests.push({ id: "console-network-desktop", status: "passed" });

    await addAnnotations(desktopPage, pageData.ctas);
    const desktopScreenshot = await desktopPage.screenshot({ fullPage: true, type: "jpeg", quality: 78 });
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: mobileUserAgent });
    await secureContext(mobile);
    const mobilePage = await mobile.newPage();
    const mobileConsoleCapture = attachConsoleNetworkCapture(mobilePage);
    try {
      await settle(mobilePage, pageData.url);
      tests.push({ id: "mobile-dom", status: "passed" });
    } catch (error) {
      tests.push({ id: "mobile-dom", status: "failed", reason: error instanceof Error ? error.message : "Navigation failed" });
      throw error;
    }
    await assertSafeUrl(mobilePage.url());
    const cookieMobile = await detectAndDismissCookieBanner(mobilePage);
    tests.push({ id: "cookie-banner-mobile", status: "passed" });
    const mobileEvidenceBrowser = await extractEvidence(mobilePage, "mobile");
    mobileEvidenceBrowser.cookieBanner = cookieMobile.evidence;
    const mobileConsoleNetwork = mobileConsoleCapture();
    tests.push({ id: "console-network-mobile", status: "passed" });
    await addAnnotations(mobilePage, pageData.ctas);
    const mobileScreenshot = await mobilePage.screenshot({ fullPage: true, type: "jpeg", quality: 75 });
    await mobile.close();

    return {
      page: pageData,
      desktopScreenshot: Buffer.from(desktopScreenshot),
      mobileScreenshot: Buffer.from(mobileScreenshot),
      ctaScreenshots,
      cookieBannerScreenshots: {
        desktop: { before: cookieDesktop.beforeScreenshot, after: cookieDesktop.afterScreenshot },
        mobile: { before: cookieMobile.beforeScreenshot, after: cookieMobile.afterScreenshot },
      },
      evidenceParts: {
        seo: seoEvidence,
        desktop: { browser: desktopEvidenceBrowser, console: desktopConsoleNetwork, ctaJourneys: ctaResults.map((r) => r.evidence) },
        mobile: { browser: mobileEvidenceBrowser, console: mobileConsoleNetwork },
        tests,
        redirects: seoEvidence.pageStatus.redirectChain,
        userAgentDesktop: desktopUserAgent,
        userAgentMobile: mobileUserAgent,
      },
    };
  } finally {
    await browser.close();
  }
}
