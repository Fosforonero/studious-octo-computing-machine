import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Lensiq is coming soon",
  description: "Lensiq is preparing a sharper AI website audit experience for clarity, SEO, accessibility and conversion.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: false,
    follow: false,
  },
};

const signals = [
  ["SEO visibility", "+38%"],
  ["Conversion clarity", "+24%"],
  ["Technical health", "92"],
] as const;

export default function ComingSoonPage() {
  return (
    <main className="hero-glow grid-noise relative min-h-screen overflow-hidden px-5 py-8 text-white md:px-10">
      <div className="absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1180px] flex-col">
        <header className="flex items-center justify-between">
          <Brand inverted />
          <Badge className="border border-white/15 bg-white/10 text-white">Private beta</Badge>
        </header>

        <section className="grid flex-1 items-center gap-12 py-20 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.2em] text-white/70">
              <Sparkles className="size-3.5 text-primary" />
              Coming soon
            </div>
            <h1 className="display mt-8 max-w-4xl text-[clamp(4.4rem,11vw,9.5rem)] leading-[.88]">
              Lensiq is sharpening its sight.
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-white/68 md:text-xl">
              We are building a more rigorous AI website auditor for teams that care about clarity, SEO, accessibility, trust and measurable growth.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-white shadow-[0_18px_60px_rgba(99,86,232,.38)] transition hover:-translate-y-0.5 hover:bg-accent-secondary"
                href="mailto:hello@lensiq.site"
              >
                <Mail className="mr-2 size-4" />
                hello@lensiq.site
              </a>
              <span className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-bold text-white/65">
                Launch work in progress
              </span>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/12 bg-white/[.07] p-4 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="rounded-[1.5rem] border border-white/10 bg-[#06122f]/90 p-5">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-white/45">Audit signal</p>
                  <p className="mt-2 text-2xl font-bold">Growth readiness</p>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-primary">Soon</div>
              </div>

              <svg className="h-56 w-full" viewBox="0 0 520 260" role="img" aria-label="Abstract Lensiq growth and SEO chart">
                <defs>
                  <linearGradient id="coming-soon-line" x1="0" x2="1" y1="0" y2="0">
                    <stop stopColor="#2f6de1" />
                    <stop offset="1" stopColor="#8d22d8" />
                  </linearGradient>
                  <linearGradient id="coming-soon-area" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#6356e8" stopOpacity=".35" />
                    <stop offset="1" stopColor="#6356e8" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M30 216H490" stroke="white" strokeOpacity=".12" />
                <path d="M30 156H490" stroke="white" strokeOpacity=".08" />
                <path d="M30 96H490" stroke="white" strokeOpacity=".08" />
                <path className="signal-area" d="M30 206C92 190 110 144 168 148C228 152 230 96 290 102C360 110 372 56 438 62C462 64 480 50 490 42V226H30Z" fill="url(#coming-soon-area)" />
                <path className="signal-line" d="M30 206C92 190 110 144 168 148C228 152 230 96 290 102C360 110 372 56 438 62C462 64 480 50 490 42" fill="none" stroke="url(#coming-soon-line)" strokeLinecap="round" strokeWidth="8" />
                {[72, 136, 200, 264, 328, 392, 456].map((x, index) => (
                  <rect
                    key={x}
                    className="signal-bar"
                    x={x}
                    y={196 - index * 16}
                    width="22"
                    height={34 + index * 16}
                    rx="11"
                    fill="white"
                    opacity=".12"
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                ))}
              </svg>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {signals.map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[.06] p-4">
                    <p className="text-xs text-white/45">{label}</p>
                    <p className="mt-2 text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Lensiq. Your website, seen clearly.</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-white/70">Privacy</Link>
            <Link href="/cookies" className="hover:text-white/70">Cookies</Link>
            <Link href="/terms" className="hover:text-white/70">Terms</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
