import Link from "next/link";
import { Bot, Check, ChevronRight, Gauge, MousePointerClick, ScanSearch, ShieldCheck, Sparkles, Smartphone } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { AuditForm } from "@/components/landing/audit-form";
import { GrowthVisual } from "@/components/landing/growth-visual";
import { Badge } from "@/components/ui/badge";

const categories = [
  ["Conversion", MousePointerClick, "Is the page turning attention into action?"],
  ["Clarity & copy", Sparkles, "Does the message land in five seconds?"],
  ["UX", ScanSearch, "Where do real visitors hesitate or get lost?"],
  ["Performance", Gauge, "What is making the experience feel slow?"],
  ["Mobile", Smartphone, "What breaks when the screen gets smaller?"],
  ["Trust", ShieldCheck, "Does the page earn belief before asking?"],
] as const;

const fixes = [
  ["01", "Your value is buried", "The headline describes the product, but never tells a buyer what gets easier. Lead with the outcome, then explain the mechanism."],
  ["02", "The mobile CTA disappears", "Your main action sits below 1.4 screens of content. Move it directly below the promise and repeat it after proof."],
  ["03", "Trust arrives too late", "Customer logos only appear after pricing. Pull three recognizable logos and one specific result above the first major decision."],
] as const;

export function FullLandingPage() {
  return <>
    <SiteHeader />
    <main>
      <section className="hero-glow grid-noise relative min-h-[850px] overflow-hidden pt-36 text-white" id="audit">
        <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-16 text-center md:px-10 md:pt-24">
          <Badge className="mb-8 border border-primary/25 bg-primary/10 text-primary">AI website auditor · Beta</Badge>
          <h1 className="display mx-auto max-w-6xl text-[clamp(5rem,13vw,12rem)]"><span className="block">See what your</span><span className="block text-primary">website misses.</span></h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-white/70 md:text-xl">Lensiq visits your website like a real customer, finds what is hurting clarity, trust and conversions — and tells you exactly what to change.</p>
          <div className="mt-10"><AuditForm /></div>
        </div>
        <div className="marquee border-y border-white/10 bg-black/15 py-4 text-xs font-bold uppercase tracking-[.18em] text-white/55"><div className="marquee-track"><span className="px-8">Conversion analysis</span><span className="px-8 text-primary">✦</span><span className="px-8">UX & clarity</span><span className="px-8 text-primary">✦</span><span className="px-8">SEO & performance</span><span className="px-8 text-primary">✦</span><span className="px-8">Mobile experience</span><span className="px-8 text-primary">✦</span><span className="px-8">Conversion analysis</span><span className="px-8 text-primary">✦</span><span className="px-8">UX & clarity</span><span className="px-8 text-primary">✦</span><span className="px-8">SEO & performance</span><span className="px-8 text-primary">✦</span><span className="px-8">Mobile experience</span><span className="px-8 text-primary">✦</span></div></div>
      </section>

      <section className="px-5 py-24 md:px-10 md:py-36" id="inside">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><span className="eyebrow">One scan. The full picture.</span></div><h2 className="display max-w-5xl text-[clamp(4rem,8vw,8rem)]">Not another SEO score. <span className="text-muted-foreground">A second pair of expert eyes.</span></h2></div>
          <div className="mt-20 grid border-l border-t sm:grid-cols-2 lg:grid-cols-3">{categories.map(([title, Icon, text], index) => <article key={title} className="min-h-64 border-b border-r p-7 transition-colors hover:bg-white md:p-9"><span className="text-xs font-bold text-muted-foreground">0{index + 1}</span><Icon className="mt-12 size-7" strokeWidth={1.5} /><h3 className="mt-5 text-xl font-bold">{title}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">{text}</p></article>)}</div>
        </div>
      </section>

      <GrowthVisual />

      <section className="bg-accent-soft px-5 py-24 md:px-10 md:py-36">
        <div className="mx-auto max-w-[1400px]"><span className="eyebrow">Specific beats generic</span><div className="mt-10 grid gap-14 lg:grid-cols-[.85fr_1.15fr]"><div><h2 className="display text-[clamp(5rem,9vw,9rem)]">Fix the right things first.</h2><p className="mt-8 max-w-md text-lg leading-7 text-muted-foreground">Every finding is ranked by impact and effort, so your next move is obvious — not buried in a 60-page PDF.</p></div><div className="space-y-3">{fixes.map(([number, title, text], index) => <article key={number} className={`rounded-2xl border p-6 md:p-8 ${index === 0 ? "bg-foreground text-white" : "bg-white"}`}><div className="flex items-start gap-5"><span className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ${index === 0 ? "bg-primary text-foreground" : "bg-muted"}`}>{number}</span><div><div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-bold">{title}</h3>{index === 0 && <Badge>High impact</Badge>}</div><p className={`mt-3 max-w-xl text-sm leading-6 ${index === 0 ? "text-white/60" : "text-muted-foreground"}`}>{text}</p></div></div></article>)}</div></div></div>
      </section>

      <section className="bg-foreground px-5 py-24 text-white md:px-10 md:py-36" id="how">
        <div className="mx-auto max-w-[1400px]"><div className="grid gap-12 lg:grid-cols-2"><div><span className="eyebrow">How Lensiq works</span><h2 className="display mt-10 text-[clamp(5rem,9vw,9rem)]">Real browser.<br /><span className="text-primary">Real signals.</span><br />Clear advice.</h2></div><div className="divide-y divide-white/15 border-y border-white/15">{[["01", "We visit", "A real browser opens your homepage on desktop and mobile — just like a customer would."], ["02", "We inspect", "Lensiq combines visual context, page structure, Lighthouse metrics and trust signals."], ["03", "Experts review", "Specialist AI reviewers analyze conversion, UX, copy, SEO, accessibility and more."], ["04", "You act", "You get a prioritized report with concrete rewrites, placements and quick wins."]].map(([number, title, text]) => <div key={number} className="grid grid-cols-[3rem_1fr] gap-5 py-8"><span className="font-mono text-xs text-primary">{number}</span><div><h3 className="text-xl font-bold">{title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-white/55">{text}</p></div></div>)}</div></div></div>
      </section>

      <section className="px-5 py-24 md:px-10 md:py-36"><div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-2"><div><span className="eyebrow">Your report includes</span><h2 className="display mt-8 text-[clamp(4.5rem,8vw,8rem)]">From score to next step.</h2></div><div className="grid gap-x-8 sm:grid-cols-2">{["Overall website score", "Top 5 priority fixes", "Executive summary", "9 expert analyses", "Desktop & mobile views", "Headline before / after", "CTA rewrite", "Quick wins", "Long-term roadmap", "Impact & effort labels"].map((item) => <div key={item} className="flex items-center gap-3 border-b py-5 text-sm font-bold"><span className="grid size-5 place-items-center rounded-full bg-primary"><Check className="size-3" /></span>{item}</div>)}</div></div></section>

      <section className="px-5 pb-5 md:px-10"><div className="hero-glow grid-noise mx-auto max-w-[1400px] rounded-[2rem] px-6 py-20 text-center text-white md:px-12 md:py-28"><Bot className="pulse-ring mx-auto size-12 rounded-full bg-primary p-3 text-foreground" /><h2 className="display mx-auto mt-8 max-w-4xl text-[clamp(4rem,8vw,8rem)]">Your website is already talking. Let&apos;s listen.</h2><div className="mt-10"><AuditForm /></div></div></section>
    </main>
    <footer className="px-5 py-10 md:px-10"><div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-5 border-t pt-8 text-xs text-muted-foreground sm:flex-row"><span>© 2026 Lensiq. Your website, seen clearly.</span><div className="flex gap-6"><Link href="/audits/demo">Sample report</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookies">Cookies</Link><Link href="/legal-notice">Legal Notice</Link><Link href="mailto:hello@lensiq.site">Contact <ChevronRight className="inline size-3" /></Link></div></div></footer>
  </>;
}
