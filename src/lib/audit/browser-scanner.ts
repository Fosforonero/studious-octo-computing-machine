import { chromium, type BrowserContext, type Page } from "playwright";
import { assertSafeUrl } from "@/lib/security/url";
import type { ExtractedPage } from "@/lib/audit/types";

export interface BrowserScanResult { page: ExtractedPage; desktopScreenshot: Buffer; mobileScreenshot: Buffer; }

async function secureContext(context: BrowserContext) {
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (!requestUrl.startsWith("http:" ) && !requestUrl.startsWith("https:")) return route.continue();
    try {
      await assertSafeUrl(requestUrl);
      await route.continue();
    } catch { await route.abort("blockedbyclient"); }
  });
}

async function settle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(700);
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
    };
  });
}

async function testCtaJourneys(context: BrowserContext, sourceUrl: string, ctas: ExtractedPage["ctas"]) {
  const source = new URL(sourceUrl);
  const candidates = ctas.filter((cta) => cta.href && ["http:", "https:"].includes(new URL(cta.href, source).protocol)).slice(0, 5);
  return Promise.all(candidates.map(async (cta) => {
    const destination = new URL(cta.href, source);
    const sameOrigin = destination.origin === source.origin;
    if (!sameOrigin) return { text: cta.text, destination: destination.toString(), outcome: "External destination detected", sameOrigin };
    const probe = await context.newPage();
    try {
      const response = await probe.goto(destination.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 });
      await assertSafeUrl(probe.url());
      const title = await probe.title();
      return { text: cta.text, destination: probe.url(), outcome: response?.ok() ? `Loaded: ${title || response.status()}` : `HTTP ${response?.status() ?? "error"}`, sameOrigin };
    } catch (error) {
      return { text: cta.text, destination: destination.toString(), outcome: error instanceof Error ? error.message.slice(0, 120) : "Could not load", sameOrigin };
    } finally { await probe.close(); }
  }));
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

export async function scanHomepage(inputUrl: string): Promise<BrowserScanResult> {
  const url = await assertSafeUrl(inputUrl);
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, userAgent: "LensiqBot/0.1 (+https://lensiq.site/bot)" });
    await secureContext(desktop);
    const desktopPage = await desktop.newPage();
    await settle(desktopPage, url);
    await assertSafeUrl(desktopPage.url());
    const pageData = await extract(desktopPage);
    pageData.ctaJourneys = await testCtaJourneys(desktop, pageData.url, pageData.ctas);
    await addAnnotations(desktopPage, pageData.ctas);
    const desktopScreenshot = await desktopPage.screenshot({ fullPage: true, type: "jpeg", quality: 78 });
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: "LensiqBot/0.1 mobile (+https://lensiq.site/bot)" });
    await secureContext(mobile);
    const mobilePage = await mobile.newPage();
    await settle(mobilePage, pageData.url);
    await assertSafeUrl(mobilePage.url());
    await addAnnotations(mobilePage, pageData.ctas);
    const mobileScreenshot = await mobilePage.screenshot({ fullPage: true, type: "jpeg", quality: 75 });
    await mobile.close();
    return { page: pageData, desktopScreenshot: Buffer.from(desktopScreenshot), mobileScreenshot: Buffer.from(mobileScreenshot) };
  } finally { await browser.close(); }
}
