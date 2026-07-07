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
          Draft for MVP validation, last updated 2026-07-08. Not yet reviewed by legal counsel — in particular the
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
              Lensiq is currently in a free beta period. If and when paid plans are introduced, this section will be
              updated with pricing, billing cycle, renewal, and refund terms before any card is charged.
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
