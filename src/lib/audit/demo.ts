import type { AuditRecord, ExpertKey, ExpertReport, Finding } from "@/lib/audit/types";

const finding = (title: string, evidence: string, recommendation: string, impact: Finding["impact"] = "high", effort: Finding["effort"] = "low"): Finding => ({ title, evidence, recommendation, impact, effort });
const section = (key: ExpertKey, score: number, summary: string, findings: Finding[]): ExpertReport => ({ key, score, summary, findings, quickWins: findings.slice(0, 2).map((item) => item.recommendation) });

const priorities = [
  finding("Lead with the outcome, not the mechanism", "The hero headline says “One workspace for modern teams”, but never names the business result or target customer.", "Replace it with: “Ship client work on time — without another status meeting.”"),
  finding("Put proof beside the first CTA", "The first customer evidence appears 1,260px below the primary CTA.", "Move the 4.8/5 rating and three recognizable customer logos directly below the hero CTA."),
  finding("Make the mobile CTA visible immediately", "At 390px, the primary CTA begins below the initial 844px viewport.", "Reduce the hero copy by two lines and place the CTA immediately after the subheadline.", "critical", "low"),
  finding("Cut the hero image payload", "The hero image transfers 1.8 MB and contributes to a 3.4s LCP.", "Serve AVIF/WebP variants under 180 KB and preload the correctly sized mobile asset.", "high", "medium"),
  finding("Answer the switching objection", "The page asks users to start a trial but never explains migration, setup time or cancellation.", "Add a three-item reassurance row: Import in minutes, guided setup, cancel anytime.", "medium", "low"),
];

export const demoAudit: AuditRecord = {
  id: "demo", url: "https://northstar.example", normalizedUrl: "https://northstar.example/", pageGoal: "Drive signups", status: "completed", paid: true, overallScore: 68, createdAt: "2026-07-06T08:42:00.000Z", completedAt: "2026-07-06T08:44:12.000Z", errorMessage: null,
  page: { url: "https://northstar.example/", title: "Northstar — One workspace for modern teams", metaDescription: "Plan, collaborate and ship your best work.", headings: [{ level: 1, text: "One workspace for modern teams" }], visibleText: "", ctas: [{ text: "Start free", href: "#", tag: "a" }], ctaJourneys: [{ text: "Start free", destination: "/signup", outcome: "Signup form loaded", sameOrigin: true }, { text: "Book a demo", destination: "/demo", outcome: "Calendar loaded", sameOrigin: true }], links: [], forms: [], aboveFold: { text: "One workspace for modern teams Plan, collaborate and ship your best work.", ctas: ["Start free"], imageCount: 1 }, landmarks: { hasNav: true, hasFooter: true, hasMain: true }, trustSignals: ["customers", "privacy"], domSummary: { elements: 842, images: 18, buttons: 5, links: 42, forms: 1 }, cookieBanner: { detected: true, dismissed: true } },
  metrics: { performanceScore: 61, accessibilityScore: 88, seoScore: 92, bestPracticesScore: 96, lcp: 3400, cls: 0.08, inpOrTbt: 210, ttfb: 480, imageIssues: ["Serve images in next-gen formats"], renderBlockingResources: 3, scriptWeightBytes: 486000 },
  report: {
    overallScore: 68,
    executiveSummary: "Northstar looks polished and credible, but the first screen makes visitors work too hard to understand the outcome. The largest gains will come from sharpening the promise, bringing proof and reassurance closer to the decision, and fixing a slow hero on mobile.",
    priorities,
    sections: [
      section("conversion", 62, "A clean funnel with an underspecified promise and proof that arrives too late.", priorities.slice(0, 2)),
      section("ux", 74, "The page is easy to scan, but the hero and feature sequence do not match buyer questions.", [finding("Reorder features around decisions", "Six equal-weight features appear before use cases or proof.", "Group features under Plan, Deliver and Report, then place one proof point after each group.", "medium", "medium")]),
      section("copywriting", 58, "The copy is concise but generic enough to fit dozens of collaboration tools.", [priorities[0]]),
      section("seo", 86, "Strong technical baseline; the title and H1 miss the category and audience language.", [finding("Name the category in the title", "The title does not contain project management, client work or agency workflow.", "Use: Northstar — Client project management for agencies.", "medium", "low")]),
      section("performance", 61, "Image weight and render-blocking styles make the page feel slower than it looks.", [priorities[3]]),
      section("accessibility", 88, "Good semantic structure with a few contrast and label gaps.", [finding("Label the email field persistently", "The newsletter input relies on placeholder text as its only label.", "Add a visible Email address label and connect it with htmlFor.", "medium", "low")]),
      section("trust", 64, "Real proof exists, but it is detached from the moments of highest uncertainty.", [priorities[1], priorities[4]]),
      section("mobile", 55, "The primary action and proof fall below the first screen, while a large image drives LCP.", [priorities[2], priorities[3]]),
    ],
    copySuggestions: [
      { label: "headline", before: "One workspace for modern teams", after: "Ship client work on time — without another status meeting.", alternative: "Stop chasing status updates across five tools.", rationale: "Names the outcome and removes an acute pain instead of describing a generic category." },
      { label: "subheadline", before: "Plan, collaborate and ship your best work.", after: "Northstar gives agencies one clear place to plan projects, collect feedback and keep every client in the loop.", alternative: "One place for agencies to plan, get feedback and keep clients in the loop.", rationale: "Identifies the audience and explains the mechanism in concrete language." },
      { label: "cta", before: "Start free", after: "Plan my first project free", alternative: "See my first project plan", rationale: "Connects the click to an immediate, low-risk outcome." },
      { label: "hero", before: "Headline + subheadline + CTA + product image", after: "Outcome headline + agency-specific explanation + CTA + no-card reassurance + rating/logos", alternative: "Outcome headline + short demo clip + CTA + logo strip", rationale: "Pairs the promise with proof and risk reduction before the visitor scrolls." },
    ],
    quickWins: ["Move the customer rating below the hero CTA.", "Change the title tag to name the category.", "Add a persistent label to the newsletter field.", "Repeat the primary CTA after the first proof block."],
    longTermImprovements: ["Rebuild feature storytelling around the agency project lifecycle.", "Create audience-specific landing pages for agencies, studios and consultancies.", "Replace the hero media pipeline with responsive AVIF assets."],
  },
};
