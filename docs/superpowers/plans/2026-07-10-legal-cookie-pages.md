# Legal Pages + Cookie Banner Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user has explicitly requested inline execution for this plan (superpowers:executing-plans), skipping the usual execution-choice gate.

**Goal:** Close verified content/architecture gaps in `/privacy`, `/terms`, `/cookies`, add `/legal-notice`, and separate cookie-consent state/config from presentation — using the exact legal text approved after compliance review, without inventing entity/governing-law/retention decisions that aren't ours to make.

**Architecture:** A new neutral module (`src/lib/analytics/consent.ts`) holds consent state/config, consumed by both the existing banner and a new, separated Client Component (`ManageCookiePreferences`). The three existing legal pages get targeted content rewrites (not full restructures); `/legal-notice` is a new page following their exact shell pattern. Two footers gain one new link each.

**Tech Stack:** Next.js 16 App Router (Server + Client Components), TypeScript, Tailwind, Docker Compose, Supabase (live project `bfxylskjgtyhvyiflnnc`, region `eu-west-1`), Playwright.

## Global Constraints

- No benchmark or competitor reference anywhere in this work.
- No change to Stripe pricing, webhook, or checkout logic in this branch.
- No EU ODR platform reference anywhere (platform closed 2025-07-20).
- Every legal page keeps its "Draft for MVP validation... not yet reviewed by legal counsel" banner.
- No claim that any AI provider has SCCs or another transfer safeguard "in place" — transfers are stated as possible, safeguards as "to be verified and documented before launch."
- No claim that data isn't used for AI training.
- Entity name, registered address, VAT/registration number, and governing law stay explicit bracketed placeholders — do not invent values.
- `/cookies/page.tsx` stays a Server Component (no `"use client"`); only `manage-cookie-preferences.tsx` is a Client Component.
- All app verification runs through `docker-compose`, per this project's Docker-only policy.

---

### Task 1: Add the neutral consent state/config module

**Files:**
- Create: `src/lib/analytics/consent.ts`

**Interfaces:**
- Consumes: nothing (new, standalone module).
- Produces: `CONSENT_STORAGE_KEY: string` and `type Consent = "granted" | "denied" | "unset"`, both imported by Task 2 (`cookie-consent.tsx`) and Task 3 (`manage-cookie-preferences.tsx`).

- [ ] **Step 1: Create the module**

```ts
export type Consent = "granted" | "denied" | "unset";

export const CONSENT_STORAGE_KEY = "lensiq-consent";
```

- [ ] **Step 2: Commit**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
git add src/lib/analytics/consent.ts
git commit -m "Add neutral consent state/config module"
```

---

### Task 2: Update the cookie-consent banner — import from the new module, fix Accept/Reject visual parity

**Files:**
- Modify: `src/components/analytics/cookie-consent.tsx` (full file, 55 lines)

**Interfaces:**
- Consumes: `CONSENT_STORAGE_KEY`, `Consent` from `@/lib/analytics/consent` (Task 1).
- Produces: `CookieConsent({ measurementId })` — unchanged public signature, only internals change.

- [ ] **Step 1: Replace the full file content**

```tsx
"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { CONSENT_STORAGE_KEY, type Consent } from "@/lib/analytics/consent";

function getSnapshot(): Consent {
  const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : "unset";
}

function getServerSnapshot(): Consent {
  return "unset";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function CookieConsent({ measurementId }: { measurementId?: string }) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [override, setOverride] = useState<Consent | null>(null);
  const consent = override ?? stored;

  function decide(value: Exclude<Consent, "unset">) {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
    setOverride(value);
  }

  return (
    <>
      {consent === "granted" && <GoogleAnalytics measurementId={measurementId} />}
      {consent === "unset" && (
        <div role="dialog" aria-live="polite" aria-label="Cookie preferences" className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b1220] px-5 py-5 text-white shadow-2xl md:px-8">
          <div className="mx-auto flex max-w-[1180px] flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl text-xs leading-6 text-white/70">
              We use a small number of cookies to understand how visitors use lensiq.site. We only set analytics cookies after you accept. See our{" "}
              <Link href="/cookies" className="font-bold text-white underline underline-offset-2">Cookie Policy</Link>{" "}for details.
            </p>
            <div className="flex shrink-0 gap-3">
              <button type="button" onClick={() => decide("denied")} className="rounded-full border border-white/70 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10">Reject</button>
              <button type="button" onClick={() => decide("granted")} className="rounded-full border border-white/70 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10">Accept</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

Note the two buttons now share the exact same class string (`rounded-full border border-white/70 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10`) — identical visual weight, differing only in label and `onClick`. This replaces the old asymmetry (solid white "Accept" pill vs. outlined secondary-looking "Reject").

- [ ] **Step 2: Verify no local `STORAGE_KEY` or `type Consent` definition remains**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
grep -n "const STORAGE_KEY\|type Consent =" src/components/analytics/cookie-consent.tsx
```

Expected: no output (both now come from the import).

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/cookie-consent.tsx
git commit -m "Fix cookie banner Accept/Reject visual parity, import consent state from shared module"
```

---

### Task 3: Add the "Manage cookie preferences" Client Component

**Files:**
- Create: `src/components/analytics/manage-cookie-preferences.tsx`

**Interfaces:**
- Consumes: `CONSENT_STORAGE_KEY` from `@/lib/analytics/consent` (Task 1).
- Produces: `ManageCookiePreferences()` — a button component with no props, rendered from Task 4's `/cookies/page.tsx` (a Server Component).

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { CONSENT_STORAGE_KEY } from "@/lib/analytics/consent";

export function ManageCookiePreferences() {
  function reset() {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={reset}
      className="rounded-full border border-foreground/30 px-5 py-2.5 text-xs font-bold text-foreground transition hover:bg-foreground/5"
    >
      Manage cookie preferences
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
git add src/components/analytics/manage-cookie-preferences.tsx
git commit -m "Add Manage cookie preferences client component"
```

---

### Task 4: Rewrite `/cookies` — renamed table, new rows, reworded approach, real Manage button

**Files:**
- Modify: `src/app/cookies/page.tsx` (full file, 89 lines)

**Interfaces:**
- Consumes: `ManageCookiePreferences` from `@/components/analytics/manage-cookie-preferences` (Task 3).
- Produces: nothing new — this is a leaf page.

- [ ] **Step 1: Replace the full file content**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ManageCookiePreferences } from "@/components/analytics/manage-cookie-preferences";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Which cookies and browser storage Lensiq uses, and how to control them.",
};

const cookies = [
  { name: "lensiq-consent", type: "Local storage (necessary)", purpose: "Remembers whether you accepted or rejected analytics cookies.", duration: "Until you clear your browser storage" },
  { name: "sb-<project-ref>-auth-token (may be split into sb-<project-ref>-auth-token.0, .1, etc.)", type: "Cookie (necessary — authentication)", purpose: "Keeps you signed in between requests. Set by our authentication provider, Supabase.", duration: "Expires automatically, or when you log out" },
  { name: "lensiq_pending_audit", type: "Cookie (necessary — functional)", purpose: "Temporarily remembers the website you submitted before you had an account, so we can start your audit once you sign up or log in.", duration: "2 hours, or removed automatically once used" },
  { name: "_ga", type: "Cookie (analytics — Google Analytics)", purpose: "Distinguishes unique visitors.", duration: "2 years" },
  { name: "_ga_<container-id>", type: "Cookie (analytics — Google Analytics)", purpose: "Persists session state for GA4 reporting.", duration: "2 years" },
];

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
          <Brand />
          <Link href="/" className="text-sm font-bold">Back home</Link>
        </div>
      </header>
      <article className="prose mx-auto max-w-3xl px-5 py-20">
        <span className="eyebrow">Cookies</span>
        <h1 className="display mt-8 text-7xl">What we store, and why.</h1>
        <p className="mt-6 text-xs font-bold uppercase tracking-wide text-amber-700">
          Draft for MVP validation, last updated 2026-07-10. Not yet reviewed by legal counsel.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
          <section>
            <h2 className="text-lg font-bold text-foreground">Our approach</h2>
            <p className="mt-2">
              Lensiq sets a small number of strictly necessary cookies and browser storage automatically,
              because certain features — staying signed in, resuming an audit you started before creating an
              account, and remembering your cookie choice — cannot work without them. These do not require
              your consent under applicable law. Analytics cookies are different: none are set on your first
              visit, a banner asks for your consent first, and if you reject or dismiss the banner without
              choosing, no analytics cookies are set and Google Analytics is never loaded.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Cookies and browser storage</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-foreground/20 text-foreground">
                    <th className="py-2 pr-4 font-bold">Name</th>
                    <th className="py-2 pr-4 font-bold">Type</th>
                    <th className="py-2 pr-4 font-bold">Purpose</th>
                    <th className="py-2 font-bold">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {cookies.map((cookie) => (
                    <tr key={cookie.name} className="border-b border-foreground/10">
                      <td className="py-2 pr-4 font-mono">{cookie.name}</td>
                      <td className="py-2 pr-4">{cookie.type}</td>
                      <td className="py-2 pr-4">{cookie.purpose}</td>
                      <td className="py-2">{cookie.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Third-party cookies</h2>
            <p className="mt-2">
              Analytics cookies are set by Google Analytics 4, operated by Google. See{" "}
              <a className="font-bold text-foreground underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google&apos;s Privacy Policy</a>{" "}
              for how Google processes this data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Changing your choice</h2>
            <p className="mt-2">
              You can reset your analytics cookie choice at any time — this clears the stored preference and
              shows the consent banner again.
            </p>
            <div className="mt-4">
              <ManageCookiePreferences />
            </div>
            <p className="mt-4">
              Email hello@lensiq.site to request deletion of any analytics data already collected.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
```

- [ ] **Step 2: Verify no `"use client"` directive was introduced**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
head -1 src/app/cookies/page.tsx
```

Expected: `import type { Metadata } from "next";` (a Server Component — no `"use client"` line).

- [ ] **Step 3: Commit**

```bash
git add src/app/cookies/page.tsx
git commit -m "Rewrite cookie policy: rename table, add Supabase/pending-audit rows, real Manage button"
```

---

### Task 5: Rewrite `/privacy` — full data-category coverage, legal basis, sub-processors, retention, rights

**Files:**
- Modify: `src/app/privacy/page.tsx` (full file, 119 lines)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — leaf page.

- [ ] **Step 1: Replace the full file content**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Lensiq collects, uses and protects data when you run a website audit.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
          <Brand />
          <Link href="/" className="text-sm font-bold">Back home</Link>
        </div>
      </header>
      <article className="prose mx-auto max-w-3xl px-5 py-20">
        <span className="eyebrow">Privacy</span>
        <h1 className="display mt-8 text-7xl">Clear by design.</h1>
        <p className="mt-6 text-xs font-bold uppercase tracking-wide text-amber-700">
          Draft for MVP validation, last updated 2026-07-10. This is not yet reviewed by legal counsel and does not
          constitute a jurisdiction-specific compliance guarantee (GDPR, CCPA/CPRA, LGPD or otherwise). Legal review
          is required before onboarding paying customers or users in any specific jurisdiction.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
          <section>
            <h2 className="text-lg font-bold text-foreground">Who controls this data</h2>
            <p className="mt-2">
              Lensiq is operated as a beta product. <strong className="text-foreground">[Legal entity name, registered
              address and jurisdiction to be added here once incorporated]</strong>. Until that information is added,
              treat hello@lensiq.site as the point of contact for all privacy questions and requests.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">What an audit processes</h2>
            <p className="mt-2">
              When you create an account, we collect your email address, used for sign-in via our authentication
              provider, Supabase. When you submit a URL, Lensiq stores: the URL and the page goal you selected;
              publicly visible content from that page (text, headings, calls to action, link and form structure —
              not form values); the outcome of following each call-to-action link on the page (its destination, and
              whether that destination is on your own site); annotated desktop and mobile screenshots; technical
              measurements from Lighthouse covering performance, accessibility, SEO and best practices; and the
              report generated from this evidence by an AI provider (see below). If you pay for an audit, we also
              store payment metadata from Stripe — such as a checkout session identifier and payment status — never
              your full card number, which Stripe processes directly and Lensiq never receives. Do not submit
              private, authenticated, password-protected or confidential pages, and only submit URLs for websites
              you own or are otherwise authorized to have audited.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Why it is processed, and on what legal basis</h2>
            <p className="mt-2">
              We process this data to perform the audit you requested and show you its results — necessary to
              perform our contract with you, including creating and maintaining your account — to keep the service
              secure and reliable, for example blocking requests to private or internal network addresses and
              keeping technical logs for abuse prevention and debugging — our legitimate interest in running a
              secure service — and, for analytics cookies only, on the basis of your consent, which you can
              withdraw at any time. We do not sell this data.
            </p>
            <p className="mt-2">
              Our hosting provider and our application automatically log standard technical information for every
              request — such as IP address, browser/user-agent, and timestamps — for security, abuse-prevention
              and debugging purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Who else sees it (sub-processors)</h2>
            <p className="mt-2">The following third parties process data on our behalf to run the service:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><strong className="text-foreground">Supabase</strong> — database, file storage and authentication for your account and audit records, hosted in the EU (eu-west-1).</li>
              <li><strong className="text-foreground">Vercel</strong> — hosting for the web application.</li>
              <li><strong className="text-foreground">Stripe</strong> — payment processing for paid audits. Lensiq never receives or stores your full card details.</li>
              <li>
                <strong className="text-foreground">An AI provider</strong> (OpenAI, Anthropic, or OpenRouter, depending on
                configuration) — receives the extracted page evidence and screenshots to generate specialist findings
                and the executive report. These providers are based outside the European Economic Area; submitting a
                page for audit means this evidence may be transferred there for processing. The specific legal basis
                and safeguards for each provider&apos;s international transfers will be verified and documented here
                before public launch.
              </li>
              <li><strong className="text-foreground">Google Analytics (GA4)</strong> — aggregate usage analytics for lensiq.site, only after you accept analytics cookies. See our <Link href="/cookies" className="font-bold text-foreground underline">Cookie Policy</Link>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Retention and deletion</h2>
            <p className="mt-2">
              A specific retention period for audits, reports, screenshots, technical logs and payment metadata
              will be published here before public launch — this is a required step before Lensiq accepts payment
              from the public, not an indefinite default. Until then, request deletion of an audit at any time by
              emailing hello@lensiq.site with the report identifier or URL.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Your rights</h2>
            <p className="mt-2">
              Depending on where you are located, you may have the right to access, correct, delete, or receive a
              copy of data we hold about an audit you submitted, to object to further processing, to request that
              we restrict how we process it, and to receive it in a portable format. If we rely on your consent
              (for analytics cookies), you can withdraw that consent at any time without affecting the lawfulness
              of processing carried out before you withdrew it — see our <Link href="/cookies" className="font-bold text-foreground underline">Cookie Policy</Link> for how. You also have the right to
              lodge a complaint with your local data protection supervisory authority. Contact hello@lensiq.site to
              exercise any of these rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Children</h2>
            <p className="mt-2">Lensiq is not directed at, and is not knowingly used by, children under 16.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Changes to this policy</h2>
            <p className="mt-2">
              If this policy changes materially, we will update the date at the top of this page.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Contact</h2>
            <p className="mt-2">
              Privacy questions: <a className="font-bold text-foreground underline" href="mailto:hello@lensiq.site">hello@lensiq.site</a>.
            </p>
          </section>

          <p className="border-t pt-6 text-xs">
            See also our <Link href="/cookies" className="font-bold text-foreground underline">Cookie Policy</Link>, <Link href="/terms" className="font-bold text-foreground underline">Terms of Service</Link> and{" "}
            <Link href="/legal-notice" className="font-bold text-foreground underline">Legal Notice</Link>.
          </p>
        </div>
      </article>
    </main>
  );
}
```

Note: the closing "See also" line now also links to `/legal-notice` (previously linked only Cookie Policy and Terms) — this is a natural, in-scope consequence of adding the new page and is consistent with the "cross-link all four legal pages" intent, not a separate correction.

- [ ] **Step 2: Verify the entity/jurisdiction placeholder and children/contact/changes sections are byte-identical to before**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
grep -n "Legal entity name, registered" src/app/privacy/page.tsx
grep -n "not directed at, and is not knowingly used by, children" src/app/privacy/page.tsx
```

Expected: both greps return exactly one match each, unchanged text.

- [ ] **Step 3: Commit**

```bash
git add src/app/privacy/page.tsx
git commit -m "Expand privacy policy: account data, CTA journeys, legal basis, Stripe, retention and rights"
```

---

### Task 6: Rewrite `/terms` — Payments section with exact refund and EU withdrawal text

**Files:**
- Modify: `src/app/terms/page.tsx` (full file, 99 lines)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — leaf page.

- [ ] **Step 1: Replace the full file content**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use Lensiq to audit a website.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
          <Brand />
          <Link href="/" className="text-sm font-bold">Back home</Link>
        </div>
      </header>
      <article className="prose mx-auto max-w-3xl px-5 py-20">
        <span className="eyebrow">Terms</span>
        <h1 className="display mt-8 text-7xl">The plain-language version.</h1>
        <p className="mt-6 text-xs font-bold uppercase tracking-wide text-amber-700">
          Draft for MVP validation, last updated 2026-07-10. Not yet reviewed by legal counsel — in particular the
          governing law, liability and payment sections need a lawyer&apos;s input before Lensiq accepts payments or
          onboards customers outside a beta/testing capacity.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
          <section>
            <h2 className="text-lg font-bold text-foreground">The service</h2>
            <p className="mt-2">
              Lensiq visits a URL you submit with an automated browser, measures it, and uses AI models to generate an
              advisory report about clarity, trust, conversion, performance and accessibility. The report is generated
              by AI and is <strong className="text-foreground">advisory only</strong> — it does not guarantee any
              specific business outcome, ranking, conversion rate, or revenue result, and it may contain errors.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Acceptable use</h2>
            <p className="mt-2">You agree to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Only submit URLs for websites you own, or are otherwise authorized to have audited.</li>
              <li>Not use Lensiq to probe, scan, or attempt to harm systems you are not authorized to test.</li>
              <li>Not attempt to circumvent rate limits, abuse protections, or the network safety checks that stop Lensiq from visiting private or internal addresses.</li>
              <li>Not scrape, reverse engineer, or resell access to the service without written permission.</li>
            </ul>
            <p className="mt-3">We may suspend or terminate access for any account or usage pattern that violates this section.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Your content</h2>
            <p className="mt-2">
              You retain all rights to your own website. Submitting a URL grants Lensiq permission to visit, measure
              and generate a report about the publicly accessible page, and to send that evidence to the configured AI
              provider for analysis, as described in our <Link href="/privacy" className="font-bold text-foreground underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Payments</h2>
            <p className="mt-2">
              Some audits require payment before Lensiq starts processing them. Payments are handled by Stripe;
              Lensiq never receives or stores your full card details. The price is shown to you at checkout before
              you pay.
            </p>
            <p className="mt-2">
              Because each audit is generated specifically for the website submitted by the customer, payments are
              generally non-refundable once processing has started, except where required by applicable law or
              where Lensiq fails to deliver the purchased service. This does not affect the customer&apos;s
              statutory rights.
            </p>
            <p className="mt-2">
              EU consumers may request that Lensiq begin performing the audit immediately. Where required by
              applicable law, we will obtain your express consent before payment and inform you when the right of
              withdrawal may be lost following performance of the service. This does not affect any mandatory
              statutory rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">No warranty, limitation of liability</h2>
            <p className="mt-2">
              The service is provided &quot;as is&quot; without warranties of any kind. To the maximum extent permitted
              by law, Lensiq is not liable for indirect, incidental, or consequential damages arising from use of the
              service or reliance on its recommendations. <strong className="text-foreground">[Jurisdiction-specific
              liability caps and consumer-protection carve-outs to be added by counsel.]</strong>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Governing law</h2>
            <p className="mt-2"><strong className="text-foreground">[To be determined with legal counsel before launch.]</strong></p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Changes to these terms</h2>
            <p className="mt-2">If these terms change materially, we will update the date at the top of this page.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Contact</h2>
            <p className="mt-2">
              Questions about these terms: <a className="font-bold text-foreground underline" href="mailto:hello@lensiq.site">hello@lensiq.site</a>.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
```

- [ ] **Step 2: Verify the exact refund and withdrawal text landed correctly**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
grep -c "Because each audit is generated specifically for the website submitted by the customer" src/app/terms/page.tsx
grep -c "EU consumers may request that Lensiq begin performing the audit immediately" src/app/terms/page.tsx
```

Expected: both commands print `1`.

- [ ] **Step 3: Commit**

```bash
git add src/app/terms/page.tsx
git commit -m "Rewrite Payments section with exact refund and EU withdrawal-right text"
```

---

### Task 7: Add `/legal-notice`

**Files:**
- Create: `src/app/legal-notice/page.tsx`

**Interfaces:**
- Consumes: `Brand` from `@/components/brand` (existing).
- Produces: nothing new — leaf page, linked from Task 8's footer updates and Task 5's privacy-page cross-link.

- [ ] **Step 1: Create the page**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Legal Notice",
  description: "Operator identity, hosting and contact information for Lensiq.",
};

export default function LegalNoticePage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
          <Brand />
          <Link href="/" className="text-sm font-bold">Back home</Link>
        </div>
      </header>
      <article className="prose mx-auto max-w-3xl px-5 py-20">
        <span className="eyebrow">Legal notice</span>
        <h1 className="display mt-8 text-7xl">Who operates Lensiq.</h1>
        <p className="mt-6 text-xs font-bold uppercase tracking-wide text-amber-700">
          Draft for MVP validation, last updated 2026-07-10. This is not yet reviewed by legal counsel and does not
          constitute a jurisdiction-specific compliance guarantee. Legal review is required before onboarding paying
          customers or users in any specific jurisdiction.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
          <section>
            <h2 className="text-lg font-bold text-foreground">Operator</h2>
            <p className="mt-2">
              Lensiq is operated as a beta product. <strong className="text-foreground">[Legal entity name,
              registered address and VAT/registration number to be added here once incorporated.]</strong> Until
              that information is added, treat hello@lensiq.site as the point of contact for all legal notices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Contact</h2>
            <p className="mt-2">
              Legal notices and complaints: <a className="font-bold text-foreground underline" href="mailto:hello@lensiq.site">hello@lensiq.site</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Hosting</h2>
            <p className="mt-2">
              This website is hosted by Vercel. See our <Link href="/privacy" className="font-bold text-foreground underline">Privacy Policy</Link> for the full list of providers who process data on our behalf.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Applicable law</h2>
            <p className="mt-2"><strong className="text-foreground">[To be determined with legal counsel before launch.]</strong></p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Complaints</h2>
            <p className="mt-2">
              If you have a complaint about our service, please contact us first at hello@lensiq.site so we can try
              to resolve it directly. <strong className="text-foreground">[Once our legal entity is registered,
              information about any applicable alternative dispute resolution (ADR) body will be added here, if one
              applies.]</strong>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Changes to this notice</h2>
            <p className="mt-2">If this notice changes materially, we will update the date at the top of this page.</p>
          </section>

          <p className="border-t pt-6 text-xs">
            See also our <Link href="/privacy" className="font-bold text-foreground underline">Privacy Policy</Link>, <Link href="/cookies" className="font-bold text-foreground underline">Cookie Policy</Link> and{" "}
            <Link href="/terms" className="font-bold text-foreground underline">Terms of Service</Link>.
          </p>
        </div>
      </article>
    </main>
  );
}
```

- [ ] **Step 2: Confirm no ODR reference exists anywhere in the new file**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
grep -in "ODR\|online dispute resolution" src/app/legal-notice/page.tsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/legal-notice/page.tsx
git commit -m "Add legal notice page"
```

---

### Task 8: Add `/legal-notice` to both footers

**Files:**
- Modify: `src/components/landing/full-landing-page.tsx` (footer line only)
- Modify: `src/app/page.tsx` (footer block only, lines 115-122)

**Interfaces:**
- Consumes: the new `/legal-notice` route (Task 7).
- Produces: nothing new.

- [ ] **Step 1: Update `full-landing-page.tsx`'s footer**

Current (single line containing the footer):
```tsx
    <footer className="px-5 py-10 md:px-10"><div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-5 border-t pt-8 text-xs text-muted-foreground sm:flex-row"><span>© 2026 Lensiq. Your website, seen clearly.</span><div className="flex gap-6"><Link href="/audits/demo">Sample report</Link><Link href="/privacy">Privacy</Link><Link href="mailto:hello@lensiq.site">Contact <ChevronRight className="inline size-3" /></Link></div></div></footer>
```

New:
```tsx
    <footer className="px-5 py-10 md:px-10"><div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-5 border-t pt-8 text-xs text-muted-foreground sm:flex-row"><span>© 2026 Lensiq. Your website, seen clearly.</span><div className="flex gap-6"><Link href="/audits/demo">Sample report</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookies">Cookies</Link><Link href="/legal-notice">Legal Notice</Link><Link href="mailto:hello@lensiq.site">Contact <ChevronRight className="inline size-3" /></Link></div></div></footer>
```

- [ ] **Step 2: Update `src/app/page.tsx`'s footer**

Current (lines 115-122):
```tsx
        <footer className="flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Lensiq. Your website, seen clearly.</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-white/70">Privacy</Link>
            <Link href="/cookies" className="hover:text-white/70">Cookies</Link>
            <Link href="/terms" className="hover:text-white/70">Terms</Link>
          </div>
        </footer>
```

New:
```tsx
        <footer className="flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Lensiq. Your website, seen clearly.</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-white/70">Privacy</Link>
            <Link href="/cookies" className="hover:text-white/70">Cookies</Link>
            <Link href="/terms" className="hover:text-white/70">Terms</Link>
            <Link href="/legal-notice" className="hover:text-white/70">Legal Notice</Link>
          </div>
        </footer>
```

- [ ] **Step 3: Verify both files reference `/legal-notice` exactly once**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
grep -c "/legal-notice" src/components/landing/full-landing-page.tsx
grep -c "/legal-notice" src/app/page.tsx
```

Expected: both print `1`.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/full-landing-page.tsx src/app/page.tsx
git commit -m "Add Legal Notice link to the landing and live coming-soon footers"
```

---

### Task 9: Full verification and cleanup

**Files:**
- None modified (verification-only task). May temporarily create `docker-compose.override.yml` and remove it before finishing.

**Interfaces:**
- Consumes: every file from Tasks 1–8.
- Produces: nothing new — final gate before the branch is done.

- [ ] **Step 1: Run typecheck, lint, and build**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"
```

Expected: all three succeed, ending with the Next.js route table (now including `/legal-notice` as a static route) and no errors.

- [ ] **Step 2: Start the dev server on a free port**

Port 3000 is occupied by an unrelated container on this machine.

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  web:
    ports: !override
      - "3100:3000"
EOF
docker-compose up -d web
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/)
  if [ "$code" = "200" ]; then echo "ready ($code)"; break; fi
  echo "waiting... ($code)"
  sleep 2
done
```

- [ ] **Step 3: Clear any stale browser cookies from earlier, unrelated testing**

```js
// via browser_run_code_unsafe, function: async (page) => { await page.context().clearCookies(); return { cleared: true }; }
```

- [ ] **Step 4: Confirm GA's script tags are absent from the DOM before consent**

Use Playwright: `browser_navigate` to `http://localhost:3100/`, then:

```js
// via browser_evaluate, function: () => ({ gtagScript: Boolean(document.getElementById('google-analytics')), gtagJsScript: Array.from(document.scripts).some(s => s.src.includes('googletagmanager.com/gtag/js')) })
```

Expected: `{ "gtagScript": false, "gtagJsScript": false }` — neither GA script tag exists pre-consent (they are never mounted, not merely hidden).

- [ ] **Step 5: Visual check — Accept and Reject render with identical weight**

`browser_snapshot`, then `browser_take_screenshot` of the cookie banner. Confirm both buttons show the same border, same background, same font-weight, same padding in the rendered screenshot — only the labels differ.

- [ ] **Step 6: Click Accept and confirm the mount gate itself works (measurement ID is unset in this environment)**

Confirmed via `grep -c "^NEXT_PUBLIC_GA_MEASUREMENT_ID=." .env.local` returning `0` — no measurement ID is configured locally, so `GoogleAnalytics` renders nothing regardless of consent (its own `if (!measurementId) return null;` guard, unrelated to the consent gate being tested here).

`browser_click` on "Accept", then re-run the same `browser_evaluate` snippet from Step 4.

Expected: `{ "gtagScript": false, "gtagJsScript": false }` still — same as Step 4, because there's no measurement ID, not because consent failed to propagate. To confirm the consent-gating logic itself (not just the measurement-ID guard), verify instead that `CookieConsent` re-rendered `<GoogleAnalytics measurementId={undefined} />` post-accept by checking the banner itself disappeared (`browser_snapshot`, confirm the "We use a small number of cookies..." dialog is gone) — that proves `consent` flipped to `"granted"` and the conditional render in `cookie-consent.tsx` executed.

- [ ] **Step 7: Real cookie-inventory check — create and confirm-signup a throwaway test user, inspect every cookie**

Reuse the established generateLink technique (no real email needed):

```bash
docker-compose exec -T web node --input-type=module - <<'EOF'
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = "lensiq-legalpages-test1@example.com";
const password = "LegalPages-Test-Pass-1!";

const { data, error } = await admin.auth.admin.generateLink({ type: "signup", email, password });
if (error) {
  console.log(JSON.stringify({ step: "generateLink", ok: false, error: error.message }));
} else {
  const tokenHash = data.properties?.hashed_token;
  const userId = data.user?.id;
  const res = await fetch(`http://localhost:3000/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup`, { redirect: "manual" });
  // userId is a random UUID, not a secret (same handling as audit ids elsewhere in this
  // project) — print it in full so Step 8 can delete this exact user without a lookup step.
  console.log(JSON.stringify({ step: "confirm", ok: true, status: res.status, userId: userId ?? null }));
}
EOF
```

Note the printed `userId` for use in Step 8. This confirms the account server-side but does not give the Playwright browser a session. To inspect the actual cookie set in a real browser, use Playwright to sign in through the real `/login` form instead (the account above is already confirmed, so `/login` will work): `browser_navigate` to `http://localhost:3100/login`, fill and submit with `lensiq-legalpages-test1@example.com` / `LegalPages-Test-Pass-1!`, then:

```js
// via browser_run_code_unsafe, function: async (page) => { const cookies = await page.context().cookies(); return cookies.map(c => ({ name: c.name, httpOnly: c.httpOnly, path: c.path })); }
```

Expected: at least one cookie whose name starts with `sb-` and contains `-auth-token` (possibly `sb-<ref>-auth-token` or chunked as `sb-<ref>-auth-token.0`, etc.), `httpOnly: true`. Compare the exact name(s) against `/cookies`' documented pattern — if the real name differs from `sb-<project-ref>-auth-token`, note the actual name for a follow-up correction (do not silently accept a mismatch).

- [ ] **Step 8: Delete the throwaway test user**

```bash
docker-compose exec -T web node --input-type=module - <<EOF
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userId = "$LENSIQ_TEST_USER_ID";
const { error } = await admin.auth.admin.deleteUser(userId);
console.log(JSON.stringify({ deleted: !error, error: error?.message ?? null }));
EOF
```

Set the shell variable from Step 7's printed `userId` before running this (e.g. `export LENSIQ_TEST_USER_ID=<value>`) — note the heredoc here is unquoted (`<<EOF`, not `<<'EOF'`) specifically so `$LENSIQ_TEST_USER_ID` expands; every other heredoc in this plan intentionally stays quoted.

- [ ] **Step 9: Click "Manage cookie preferences" on `/cookies` and confirm the banner reappears**

`browser_navigate` to `http://localhost:3100/cookies`, `browser_snapshot` to find the "Manage cookie preferences" button, `browser_click` it, then `browser_snapshot` again.

Expected: the page reloads and the cookie-consent banner ("We use a small number of cookies...") is visible again.

- [ ] **Step 10: Visit `/legal-notice`**

`browser_navigate` to `http://localhost:3100/legal-notice`, `browser_snapshot`.

Expected: renders with the "Legal notice" eyebrow, "Who operates Lensiq." heading, the amber draft disclaimer, and Operator/Contact/Hosting/Applicable law/Complaints/Changes sections.

- [ ] **Step 11: Confirm both footers render the new link**

For the live page: `browser_navigate` to `http://localhost:3100/`, `browser_snapshot`, confirm a "Legal Notice" link is present in the footer alongside Privacy/Cookies/Terms.

For `full-landing-page.tsx`: this component isn't mounted on any live route (confirmed dormant), so verify via the Step 3 grep checks from Task 8 instead of a live visit — already done in that task.

- [ ] **Step 12: Tear down and confirm clean state**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
docker-compose down
rm -f docker-compose.override.yml
rm -rf .playwright-mcp
git status --short
```

Expected: only the benign, pre-existing `next-env.d.ts` churn (if any) — discard it:

```bash
git checkout -- next-env.d.ts 2>/dev/null; git status --short
```

Expected: no output (fully clean working tree).

- [ ] **Step 13: Confirm the branch is ready**

```bash
git log --oneline main..HEAD
git status --short
```

Expected: 11 commits ahead of `main` (design spec ×2, this plan, and 8 implementation commits from Tasks 1–8), clean working tree. Report this as ready for the finishing-a-development-branch step.
