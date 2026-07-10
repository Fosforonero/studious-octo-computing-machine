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
              <li><strong className="text-foreground">Google Analytics (GA4)</strong> — usage analytics for lensiq.site, only after you accept analytics cookies. See our <Link href="/cookies" className="font-bold text-foreground underline">Cookie Policy</Link>.</li>
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
