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
