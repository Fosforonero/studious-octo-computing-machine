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
3. **EU pre-checkout consent for immediate performance is explicitly OUT of scope for this branch.** EU consumer law requires an explicit, not-pre-ticked consent *before* payment/execution starts when a service performs immediately (acknowledging loss of the 14-day withdrawal right) — stating this in Terms text alone does not satisfy the requirement; it needs a real checkout-flow UI mechanic. This is tracked as its own backlog item (`project_backlog_legal_and_brand_assets` memory, item 3) and is a **blocking prerequisite for Stripe Live**, not part of this task. The Terms text below states the underlying policy honestly without claiming the UI mechanic already exists.
4. **`/privacy`'s "What an audit processes" must explicitly cover:** submitted URL; public page content and metadata; desktop/mobile screenshots and CTA click-destination results; Lighthouse performance/accessibility/SEO/best-practices data; that page evidence is sent to an AI provider and used to generate the report; Stripe payment identifiers/metadata (never full card data); IP address, user agent, and technical/access logs; legal basis for each purpose; retention (stays a placeholder, unchanged); AI providers actually configured (already accurate); international-transfer safeguards (see below); GDPR rights and controller contact (already present).
5. **No claim that data isn't used for AI training.** Not present in the current draft; must not be added — it isn't contractually verified for any active provider.
6. **`/cookies` must:** describe the Supabase cookie as a **pattern** (`sb-<project-ref>-auth-token`, possibly chunked into `.0`/`.1`/... suffixes for large tokens), not one asserted fixed name; add `lensiq_pending_audit`; keep documenting the `lensiq-consent` storage key; have its inventory verified against a real live session (implementation-time step, not asserted in the spec); confirm GA4 is fully blocked pre-consent (verified true by reading the code — `GoogleAnalytics` never mounts before `consent === "granted"`); confirm Reject is visually as accessible as Accept (implementation-time visual check, not assumed); the persistent "Manage cookie preferences" control resets consent and reopens the banner, fine with a single optional category (Analytics).
7. **`/legal-notice` placeholders (operator identity, address, contact, VAT/registration number, governing law) and every "draft" banner across all four legal pages are explicit, deliberate placeholders for this branch — but are hard launch blockers before selling.** Tracked in `project_backlog_legal_and_brand_assets` memory, item 4. This spec does not attempt to resolve them.
8. **Footer gets all four legal links**: Privacy, Terms, Cookies, Legal Notice.
9. Branch prerequisites (already satisfied before this spec was written): PR #12 merged, `main` pulled (confirmed at commit `d04198b`), branch `feature/legal-cookie-pages` created from that `main`.

## Changes

### 1. `/privacy` (`src/app/privacy/page.tsx`)

- Rewrite "What an audit processes" to explicitly list: URL + page goal; public page content and metadata (title, headings, meta description, visible text, link/form structure); the outcome of following each call-to-action link (destination, whether same-origin); annotated desktop/mobile screenshots; Lighthouse-derived performance, accessibility, SEO and best-practices measurements; that this evidence is sent to the configured AI provider to generate the report; your account email (Supabase Auth); and, if you pay for an audit, payment metadata from Stripe (checkout session identifier, payment status) — never your full card number, which Stripe processes directly.
- Rewrite "Why it is processed" to name legal bases: contract performance (account, audit generation), legitimate interest (security/abuse-prevention, technical logs), and consent (analytics cookies only).
- Add a line noting standard technical/access logs (IP address, user agent) are collected automatically by the hosting provider and the application for security, abuse-prevention and debugging.
- Extend the Supabase sub-processor bullet to mention Authentication alongside database/storage.
- Add a new Stripe sub-processor bullet: payment processing; Lensiq never receives full card details.
- Extend the AI-provider sub-processor bullet with a transfer-safeguard sentence: these providers are based outside the EEA; transfers rely on the safeguards each provider has in place (such as Standard Contractual Clauses), with provider-specific mechanisms to be confirmed and documented before public launch.
- No change to: entity/jurisdiction placeholder, retention section, rights section, children section, contact section — all already correct or explicitly deferred.

### 2. `/terms` (`src/app/terms/page.tsx`)

- Rewrite "Payments" to: state that audits are a paid service (Stripe-processed), use the exact refund-clause text from correction 2 above, note that Stripe processes payment and Lensiq never stores full card details, and add a sentence on the EU immediate-performance consent principle (the policy commitment, not a claim that a UI checkbox already enforces it) — e.g. "For consumers in the European Union: starting your audit immediately means you agree to waive your statutory 14-day right of withdrawal once processing begins; where required by law, we will ask you to explicitly confirm this before payment." No specific price is written anywhere in this section — it stays price-agnostic since the actual price is a separate, evolving pricing task.
- No change to: "The service", "Acceptable use", "Your content", "No warranty", "Governing law" (stays a placeholder), "Changes", "Contact".

### 3. `/cookies` (`src/app/cookies/page.tsx`)

- Add two rows to the `cookies` table: `sb-<project-ref>-auth-token` (pattern; may be split into multiple chunked cookies) — Necessary (authentication) — "Keeps you signed in between requests" — set by Supabase, expires automatically or on logout; and `lensiq_pending_audit` — Necessary (functional) — "Temporarily remembers the website you submitted before you had an account, so we can start your audit once you sign up or log in" — 2 hours, or removed automatically once used (matches the actual `COOKIE_MAX_AGE` in `src/lib/audit/pending-claim.ts`).
- Reword "Our approach" to distinguish strictly-necessary cookies (auth, pending-audit claim, the consent choice itself — set automatically because the related feature cannot work without them, and don't require consent under applicable law) from analytics cookies (GA, opt-in only, never loaded before Accept).
- Replace "Changing your choice"'s manual clear-your-browser instructions with a real **"Manage cookie preferences"** button that resets the stored consent and reloads the page so the banner reappears.

### 4. New page: `/legal-notice` (`src/app/legal-notice/page.tsx`)

Same shell pattern as the other three pages (`Brand` header, "Back home" link, prose article, amber "Draft for MVP validation... not yet reviewed by legal counsel" disclaimer). Sections: Operator (placeholder — name, address, registration/VAT number, consistent bracketed style with `/privacy`'s entity placeholder), Contact (hello@lensiq.site — real), Hosting (Vercel Inc., disclosed), Applicable law (placeholder, consistent with `/terms`), Complaints (contact email; no ODR platform reference; a bracketed note that applicable ADR body information, if any, will be added once the legal entity is registered).

### 5. `cookie-consent.tsx` (`src/components/analytics/cookie-consent.tsx`)

Export the `STORAGE_KEY` constant (currently module-private) so the new `/cookies` "Manage cookie preferences" button reuses the exact same key instead of a duplicated magic string. No change to the banner's own UI — still Accept/Reject only, "Manage" lives on `/cookies` as a persistent control instead of a third banner button (the banner only renders while consent is unset, so a "Manage" button inside it would have nowhere to live once a choice is made).

### 6. `full-landing-page.tsx` footer (`src/components/landing/full-landing-page.tsx`)

Add `/terms`, `/cookies`, and `/legal-notice` links next to the existing `/privacy` link. Dormant file, not linked from the live site — zero live-traffic risk.

## Explicitly out of scope

- The EU pre-checkout consent UI mechanic (checkbox at the payment step) — separate, blocking-for-Stripe-Live backlog item.
- Filling in real legal entity name, address, VAT/registration number, or governing law — none exists yet; stays a placeholder, tracked as a launch blocker.
- Removing the "draft, not reviewed by counsel" banners — same reason, same launch-blocker tracking.
- `/api/checkout`'s missing ownership check — separate backlog item, unrelated to legal content.
- Any change to Stripe pricing, webhook, or checkout logic.
- Any change to the live coming-soon home page or its lockdown/noindex status.
- Any competitor or benchmark reference anywhere in this work.

## Verification plan

1. `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"` — green.
2. Live session check: log in as a real (throwaway, cleaned-up-after) test user and inspect the actual Supabase auth cookie name(s) via Playwright's `context().cookies()`, confirming the `/cookies` table's stated pattern matches reality exactly.
3. Visual check: confirm GA's `<Script>` tags are absent from the DOM before consent, and present only after clicking Accept (not just visually hidden).
4. Visual check: confirm Reject and Accept are equally sized, equally labeled, and equally clickable in the consent banner (not a dark pattern).
5. Functional check: click "Manage cookie preferences" on `/cookies`, confirm consent resets and the banner reappears.
6. Visit `/legal-notice` and confirm it renders with the same shell/disclaimer pattern as the other three pages.
7. Confirm `full-landing-page.tsx`'s footer renders all four legal links (this file isn't part of any live route, so this is a code-level/rendered-snapshot check, not a live-traffic check).
