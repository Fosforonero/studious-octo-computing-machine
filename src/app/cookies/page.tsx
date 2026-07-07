import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Which cookies and local storage Lensiq uses, and how to control them.",
};

const cookies = [
  { name: "lensiq-consent", type: "Local storage (not a cookie)", purpose: "Remembers whether you accepted or rejected analytics cookies.", duration: "Until you clear your browser storage" },
  { name: "_ga", type: "Analytics cookie (Google Analytics)", purpose: "Distinguishes unique visitors.", duration: "2 years" },
  { name: "_ga_<container-id>", type: "Analytics cookie (Google Analytics)", purpose: "Persists session state for GA4 reporting.", duration: "2 years" },
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
          Draft for MVP validation, last updated 2026-07-08. Not yet reviewed by legal counsel.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
          <section>
            <h2 className="text-lg font-bold text-foreground">Our approach</h2>
            <p className="mt-2">
              Lensiq sets no cookies or analytics tracking on your first visit. A banner asks for your consent before
              any analytics cookie is set. If you reject or dismiss the banner without choosing, no analytics cookies
              are set and Google Analytics is never loaded.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">What we use</h2>
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
              Clear your browser&apos;s local storage and cookies for lensiq.site to see the consent banner again, or
              email hello@lensiq.site to request deletion of any analytics data already collected.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
