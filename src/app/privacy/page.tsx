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
          Draft for MVP validation, last updated 2026-07-08. This is not yet reviewed by legal counsel and does not
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
              When you submit a URL, Lensiq stores: the URL and the page goal you selected; publicly visible content
              from that page (text, headings, calls to action, link and form structure — not form values); annotated
              desktop and mobile screenshots; technical performance measurements (Lighthouse); and the generated
              report. Do not submit private, authenticated, password-protected or confidential pages, and only submit
              URLs for websites you own or are otherwise authorized to have audited.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Why it is processed</h2>
            <p className="mt-2">
              This data is used only to perform the requested audit, show its results to you, and protect the service
              from abuse (for example, blocking requests to private or internal network addresses). We do not sell
              this data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Who else sees it (sub-processors)</h2>
            <p className="mt-2">The following third parties process data on our behalf to run the service:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><strong className="text-foreground">Supabase</strong> — database and file storage for audit records and screenshots, hosted in the EU.</li>
              <li><strong className="text-foreground">Vercel</strong> — hosting for the web application.</li>
              <li>
                <strong className="text-foreground">An AI provider</strong> (OpenAI, Anthropic, or OpenRouter, depending on
                configuration) — receives the extracted page evidence and screenshots to generate specialist findings
                and the executive report. These providers are based in the United States; submitting a page for audit
                means this evidence is transferred there for processing.
              </li>
              <li><strong className="text-foreground">Google Analytics (GA4)</strong> — aggregate usage analytics for lensiq.site, only after you accept analytics cookies. See our <Link href="/cookies" className="font-bold text-foreground underline">Cookie Policy</Link>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Retention and deletion</h2>
            <p className="mt-2">
              MVP retention limits are not yet finalized and will be published here before public launch. Until then,
              request deletion of an audit at any time by emailing hello@lensiq.site with the report identifier or URL.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Your rights</h2>
            <p className="mt-2">
              Depending on where you are located, you may have the right to access, correct, delete, or receive a copy
              of data we hold about an audit you submitted, and to object to further processing. Contact
              hello@lensiq.site to exercise any of these rights.
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
            See also our <Link href="/cookies" className="font-bold text-foreground underline">Cookie Policy</Link> and{" "}
            <Link href="/terms" className="font-bold text-foreground underline">Terms of Service</Link>.
          </p>
        </div>
      </article>
    </main>
  );
}
