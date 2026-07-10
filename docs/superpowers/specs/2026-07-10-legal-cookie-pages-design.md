# Legal Pages + Cookie Banner Audit — Design

**Goal:** Close the real, verified gaps in the existing `/privacy`, `/terms`, `/cookies` drafts, add `/legal-notice`, and close a genuine cookie-inventory gap in the consent banner flow — without inventing legal decisions that aren't ours to make (entity, governing law) and without expanding into checkout-flow changes that belong to a separate, later task.

## Context: these are drafts, not empty stubs

`/privacy`, `/terms`, and `/cookies` (`src/app/{privacy,terms,cookies}/page.tsx`) already contain substantial, thoughtful content dated 2026-07-08, each carrying an explicit "Draft for MVP validation... not yet reviewed by legal counsel" banner. A working cookie-consent banner (`src/components/analytics/cookie-consent.tsx`) already exists: it renders `GoogleAnalytics` (`src/components/analytics/google-analytics.tsx`) only when `consent === "granted"`, meaning the GA `<Script>` tags are never added to the DOM — not merely "disabled" — until the user explicitly accepts. This task is a targeted audit-and-close-gaps pass, not a rewrite.

No reconstructed/competitor content is used anywhere in this work, per the project's standing no-competitor-references rule.

## Verified findings that drive scope

- `/privacy`'s "What an audit processes" section never mentions account/email data, despite every audit now requiring signup (Sprint A/B) — confirmed via `grep -in "account\|email\|password\|sign"` returning no relevant matches.
- `/privacy`'s sub-processor list never mentions **Stripe**, despite live Stripe Checkout integration — confirmed by reading the full section.
- `/privacy` never states a GDPR legal basis for processing, never mentions IP/user-agent/technical logs, never mentions the international-transfer safeguard mechanism for the US-based AI providers, and never explicitly names CTA-click-journey data (Lensiq clicks CTAs and records their destination — a materially different, more active data point than "reads page content").
- `/terms`'s "Payments" section says "currently in a free beta period... if and when paid plans are introduced" — stale; Stripe Checkout is live and tested (PR #6, #7, #12).
- `/cookies`'s cookie table lists only `lensiq-consent` (localStorage) and GA cookies — missing the Supabase auth session cookie (Sprint A) and `lensiq_pending_audit` (Sprint B), both real and currently active.
- No `/legal-notice` or `/imprint` page exists.
- `full-landing-page.tsx`'s footer links only to `/privacy` — missing `/terms`, `/cookies`, and (once it exists) `/legal-notice`. Confirmed low-risk to fix: this file is dormant, not linked from the live coming-soon home page.
- All three AI providers (OpenAI, Anthropic, OpenRouter) are genuinely wired and selectable via `AI_PROVIDER` / fallback logic (`src/lib/audit/ai-provider.ts`) — `/privacy`'s existing "depending on configuration" language is already accurate and is kept as-is.

## Explicit corrections from user review (binding for this spec)

1. **No EU ODR platform reference.** The EU's Online Dispute Resolution platform was decommissioned in 2025 and must not be presented as an active channel. `/legal-notice` names a support email and leaves room for a specific ADR body once the legal entity exists — no ODR link anywhere.
2. **Refund clause — exact required text**, price-agnostic, with statutory-rights and non-delivery carve-outs:
   > "Because each audit is generated specifically for the website submitted by the customer, payments are generally non-refundable once processing has started, except where required by applicable law or where Lensiq fails to deliver the purchased service. This does not affect the customer's statutory rights."
3. **EU withdrawal-right text — exact required wording**, deliberately cautious (does not assert Lensiq's precise legal classification, which needs real legal validation, and frames it as consumer-requested rather than an outright waiver):
   > "EU consumers may request that Lensiq begin performing the audit immediately. Where required by applicable law, we will obtain your express consent before payment and inform you when the right of withdrawal may be lost following performance of the service. This does not affect any mandatory statutory rights."
   The checkbox/consent-capture UI mechanic and its record-keeping remain a **separate blocker for Stripe Live** (`project_backlog_legal_and_brand_assets` memory, item 3) — not part of this task. The Terms text states the policy honestly without claiming the UI mechanic already exists.
4. **`/privacy`'s "What an audit processes" must explicitly cover:** submitted URL; public page content and metadata; desktop/mobile screenshots and CTA click-destination results; Lighthouse performance/accessibility/SEO/best-practices data; that page evidence is sent to an AI provider and used to generate the report; Stripe payment identifiers/metadata (never full card data); IP address, user agent, and technical/access logs; legal basis for each purpose; AI providers actually configured (already accurate); GDPR rights and controller contact (expanded, see below).
5. **No claim that data isn't used for AI training.** Not present in the current draft; must not be added — it isn't contractually verified for any active provider.
6. **No claim that any AI provider has SCCs or other transfer safeguards actually in place**, until each provider's DPA, processing region, and transfer mechanism have been verified individually. The draft states plainly that international transfers may occur and that the legal basis/safeguards will be documented before launch — it does not assert a specific mechanism.
7. **Retention periods and international-transfer safeguards are explicit launch blockers**, tracked alongside legal entity, VAT/registration number, and governing law — not left as vague "not yet finalized" text with no forcing function. See the updated memory entry.
8. **Expand the GDPR rights section** to explicitly include: restriction of processing; data portability; the right to withdraw analytics consent at any time (without affecting the lawfulness of processing carried out before withdrawal); and the right to lodge a complaint with the competent supervisory authority.
9. **Verify entities/regions instead of asserting them:**
   - Supabase "hosted in the EU" — **verified true**: the live Supabase project's region is `eu-west-1` (confirmed via the Supabase MCP `list_projects` call used earlier in this engagement), which is within the EU/EEA. This claim stays, now on verified grounds.
   - "Vercel Inc." — **not verified** (no access to the actual contracting entity/legal name on file). Refer to the hosting provider generically as "Vercel" (the service, a directly observable technical fact — the app is deployed there) rather than asserting a specific corporate suffix.
   - Cookie inventory — verified against a real live session at implementation time (see Verification plan), explicitly including any temporary/chunked cookies the Auth flow may set, not just the primary session cookie.
10. **`/cookies`' table is renamed "Cookies and browser storage"** (not just "cookies"), since `lensiq-consent` is localStorage, not a cookie. It must: describe the Supabase cookie as a **pattern** (`sb-<project-ref>-auth-token`, possibly chunked into `.0`/`.1`/... suffixes for large tokens), not one asserted fixed name; add `lensiq_pending_audit`; keep documenting the `lensiq-consent` storage key; confirm GA4 is fully blocked pre-consent (verified true by reading the code — `GoogleAnalytics` never mounts before `consent === "granted"`); the persistent "Manage cookie preferences" control resets consent and reopens the banner, fine with a single optional category (Analytics).
11. **The consent banner's Reject and Accept must have genuinely equal visual prominence, not just equal size/clickability.** Today Accept is a solid white pill (primary-looking) and Reject is an outlined secondary-looking button — a real dark-pattern risk under EDPB guidance. In scope: a small style fix giving both buttons identical visual weight.
12. **"Manage cookie preferences" is a real, separated Client Component, not inline logic in the Server Component page:**
    - `/cookies/page.tsx` stays a Server Component (already is — no `"use client"` today, unchanged).
    - New `src/components/analytics/manage-cookie-preferences.tsx` (`"use client"`) — the button itself.
    - `STORAGE_KEY` moves out of `cookie-consent.tsx` into a neutral module, `src/lib/analytics/consent.ts`, imported by both the banner and the new button — separating state/config from presentation rather than importing the constant directly from a UI component.
13. **`/legal-notice` gets added to the footer of both** `full-landing-page.tsx` (dormant) **and the live coming-soon home page** (`src/app/page.tsx`), which already links Privacy/Cookies/Terms in its footer (confirmed by reading the file) — this is a live-site change, deliberately authorized here, additive-only, does not touch the coming-soon lockdown/`noindex` status.
14. **`/legal-notice` placeholders (operator identity, address, contact, VAT/registration number, governing law) and every "draft" banner across all four legal pages are explicit, deliberate placeholders for this branch — but are hard launch blockers before selling.** Tracked in `project_backlog_legal_and_brand_assets` memory, item 4 (now also covering retention and transfer safeguards, per correction 7). This spec does not attempt to resolve them.
15. Branch prerequisites (already satisfied before this spec was written): PR #12 merged, `main` pulled (confirmed at commit `d04198b`), branch `feature/legal-cookie-pages` created from that `main`.
16. Kept unchanged throughout: no benchmark/competitor references anywhere; no Stripe/checkout logic changes in this branch; no EU ODR reference (platform closed since 2025-07-20, per the European Commission); every legal page stays clearly marked draft; typecheck/lint/build plus a final live browser check are required before this is considered done.

## Changes

### 1. `/privacy` (`src/app/privacy/page.tsx`)

- Rewrite "What an audit processes" to explicitly list: URL + page goal; public page content and metadata (title, headings, meta description, visible text, link/form structure); the outcome of following each call-to-action link (destination, whether same-origin); annotated desktop/mobile screenshots; Lighthouse-derived performance, accessibility, SEO and best-practices measurements; that this evidence is sent to the configured AI provider to generate the report; your account email (Supabase Auth); and, if you pay for an audit, payment metadata from Stripe (checkout session identifier, payment status) — never your full card number, which Stripe processes directly.
- Rewrite "Why it is processed" to name legal bases: contract performance (account, audit generation), legitimate interest (security/abuse-prevention, technical logs), and consent (analytics cookies only).
- Add a line noting standard technical/access logs (IP address, user agent) are collected automatically by the hosting provider and the application for security, abuse-prevention and debugging.
- Extend the Supabase sub-processor bullet to mention Authentication alongside database/storage; region claim ("hosted in the EU") stays, now backed by the verified `eu-west-1` project region.
- Add a new Stripe sub-processor bullet: payment processing; Lensiq never receives full card details.
- Refer to hosting generically as "Vercel" (not "Vercel Inc.") — the specific contracting entity is unverified.
- Extend the AI-provider sub-processor bullet with a transfer sentence that does **not** assert a specific safeguard mechanism: international transfers may occur since these providers are based outside the EEA; the legal basis and safeguards for each will be verified and documented before public launch.
- Rewrite "Retention and deletion" to explicitly frame the missing retention period as a **launch blocker** (not indefinite silence) — e.g. state that a specific retention period will be published before public launch, alongside the entity/VAT/governing-law placeholders, rather than leaving an open-ended "not yet finalized."
- Expand "Your rights" to add: restriction of processing; data portability; the right to withdraw analytics consent at any time without affecting the lawfulness of prior processing; the right to lodge a complaint with the competent supervisory authority.
- No change to: entity/jurisdiction placeholder, children section, contact section.

### 2. `/terms` (`src/app/terms/page.tsx`)

- Rewrite "Payments" to: state that audits are a paid service (Stripe-processed), use the exact refund-clause text from correction 2, note that Stripe processes payment and Lensiq never stores full card details, and use the exact EU withdrawal-right text from correction 3 (not the earlier draft's "you agree to waive" framing). No specific price is written anywhere in this section — it stays price-agnostic since the actual price is a separate, evolving pricing task.
- No change to: "The service", "Acceptable use", "Your content", "No warranty", "Governing law" (stays a placeholder), "Changes", "Contact".

### 3. `/cookies` (`src/app/cookies/page.tsx`)

- Rename the table section "Cookies and browser storage" (was "What we use").
- Add two rows to the table: `sb-<project-ref>-auth-token` (pattern; may be split into multiple chunked cookies — exact live shape confirmed in Verification plan) — Necessary (authentication) — "Keeps you signed in between requests" — set by Supabase, expires automatically or on logout; and `lensiq_pending_audit` — Necessary (functional) — "Temporarily remembers the website you submitted before you had an account, so we can start your audit once you sign up or log in" — 2 hours, or removed automatically once used (matches the actual `COOKIE_MAX_AGE` in `src/lib/audit/pending-claim.ts`).
- Reword "Our approach" to distinguish strictly-necessary cookies/storage (auth, pending-audit claim, the consent choice itself — set automatically because the related feature cannot work without them, and don't require consent under applicable law) from analytics cookies (GA, opt-in only, never loaded before Accept).
- Replace "Changing your choice"'s manual clear-your-browser instructions with the new `<ManageCookiePreferences />` client component (see below), rendered from this Server Component page.

### 4. New page: `/legal-notice` (`src/app/legal-notice/page.tsx`)

Same shell pattern as the other three pages (`Brand` header, "Back home" link, prose article, amber "Draft for MVP validation... not yet reviewed by legal counsel" disclaimer). Sections: Operator (placeholder — name, address, registration/VAT number, consistent bracketed style with `/privacy`'s entity placeholder), Contact (hello@lensiq.site — real), Hosting ("Vercel", generic per correction 9), Applicable law (placeholder, consistent with `/terms`), Complaints (contact email; no ODR platform reference; a bracketed note that applicable ADR body information, if any, will be added once the legal entity is registered).

### 5. `src/lib/analytics/consent.ts` (new)

A neutral state/config module, no `"use client"`, no UI: exports the `CONSENT_STORAGE_KEY` constant (moved out of `cookie-consent.tsx`) and the `Consent` type (`"granted" | "denied" | "unset"`). Both `cookie-consent.tsx` and the new `manage-cookie-preferences.tsx` import from here — neither imports the constant from the other's UI component.

### 6. `src/components/analytics/cookie-consent.tsx` (modified)

Import `CONSENT_STORAGE_KEY` and `Consent` from `src/lib/analytics/consent.ts` instead of defining them locally. Fix the Reject/Accept button styling so both have identical visual weight (same classes — same border, background, and text treatment — differing only in label and `onClick`), removing the current solid-white-vs-outlined asymmetry. No other change to the banner's structure or logic.

### 7. `src/components/analytics/manage-cookie-preferences.tsx` (new)

`"use client"`. A single button: "Manage cookie preferences". On click, removes `CONSENT_STORAGE_KEY` from `localStorage` (imported from `src/lib/analytics/consent.ts`) and reloads the page, so `CookieConsent` re-reads an unset consent and the banner reappears. Rendered from `/cookies/page.tsx`, which stays a Server Component — this is the only client boundary this task introduces.

### 8. `full-landing-page.tsx` footer (`src/components/landing/full-landing-page.tsx`)

Add `/terms`, `/cookies`, and `/legal-notice` links next to the existing `/privacy` link. Dormant file, not linked from the live site — zero live-traffic risk.

### 9. Live coming-soon home page footer (`src/app/page.tsx`)

Add a `/legal-notice` link next to the existing `/privacy`, `/cookies`, `/terms` links (lines 118-120, confirmed present). This is a live-site change — additive only, does not touch the page's `noindex`/coming-soon lockdown.

## Explicitly out of scope

- The EU pre-checkout consent UI mechanic (checkbox at the payment step) and its consent record-keeping — separate, blocking-for-Stripe-Live backlog item.
- Filling in real legal entity name, address, VAT/registration number, governing law, or a specific retention period — none exists yet; all stay placeholders, tracked as launch blockers.
- Removing the "draft, not reviewed by counsel" banners — same reason, same launch-blocker tracking.
- `/api/checkout`'s missing ownership check — separate backlog item, unrelated to legal content.
- Any change to Stripe pricing, webhook, or checkout logic.
- Any change to the live coming-soon home page's lockdown/`noindex` status (the one footer link addition above is the only live-page change, and doesn't touch that status).
- Any competitor or benchmark reference anywhere in this work.

## Verification plan

1. `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"` — green.
2. Live session check: log in as a real (throwaway, cleaned-up-after) test user and inspect the actual cookie inventory via Playwright's `context().cookies()` — every cookie present, not just the expected auth cookie, to catch any temporary/chunked cookies the Auth flow sets — confirming the `/cookies` table's stated pattern matches reality exactly.
3. Visual check: confirm GA's `<Script>` tags are absent from the DOM before consent, and present only after clicking Accept (not just visually hidden).
4. Visual check: confirm Reject and Accept render with identical visual weight after the style fix (screenshot comparison, not just class-name inspection).
5. Functional check: click "Manage cookie preferences" on `/cookies`, confirm consent resets and the banner reappears.
6. Visit `/legal-notice` and confirm it renders with the same shell/disclaimer pattern as the other three pages.
7. Confirm `full-landing-page.tsx`'s footer and the live coming-soon page's footer both render all four legal links.
8. Confirm `/cookies/page.tsx` has no `"use client"` directive (stays a Server Component) while `manage-cookie-preferences.tsx` does.
