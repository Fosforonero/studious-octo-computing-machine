import { ArrowUpRight, Search, TrendingUp } from "lucide-react";

const bars = [38, 52, 47, 65, 72, 84, 94] as const;

export function GrowthVisual() {
  return (
    <section className="px-5 py-24 md:px-10 md:py-36" aria-labelledby="signals-title">
      <div className="mx-auto grid max-w-[1400px] gap-14 lg:grid-cols-[.72fr_1.28fr] lg:items-center">
        <div>
          <span className="eyebrow">From diagnosis to momentum</span>
          <h2 id="signals-title" className="display mt-9 max-w-2xl text-[clamp(4.5rem,8vw,8rem)]">See where growth gets stuck.</h2>
          <p className="mt-8 max-w-lg text-lg leading-8 text-muted-foreground">Lensiq connects technical health, search visibility and conversion friction in one view—so teams can prioritize changes with a clear business reason.</p>
          <p className="mt-5 text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Illustrative report visualization</p>
        </div>

        <div className="overflow-hidden rounded-[2rem] bg-foreground p-5 text-white shadow-[0_30px_90px_rgba(8,20,50,.18)] md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div><span className="text-xs font-bold uppercase tracking-[.14em] text-white/45">Growth signals</span><h3 className="mt-2 text-xl font-bold">Opportunity overview</h3></div>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-2 text-xs font-bold text-[#a9a1ff]"><TrendingUp className="size-4" /> Positive trajectory</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[{ label: "SEO health", value: "92", change: "+14" }, { label: "Organic visibility", value: "68%", change: "+23%" }, { label: "Conversion clarity", value: "84", change: "+18" }].map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
                <span className="text-[11px] text-white/45">{metric.label}</span>
                <div className="mt-5 flex items-end justify-between gap-3"><strong className="text-3xl tracking-tight">{metric.value}</strong><span className="text-xs font-bold text-[#a9a1ff]">{metric.change}</span></div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5 md:p-6">
              <div className="flex items-center justify-between"><div><span className="text-[11px] text-white/45">Search opportunity</span><p className="mt-1 text-sm font-bold">Visibility trend</p></div><Search className="size-5 text-[#8b7ff5]" /></div>
              <svg className="mt-7 h-44 w-full" viewBox="0 0 480 180" role="img" aria-labelledby="trend-title trend-desc">
                <title id="trend-title">Illustrative upward search visibility trend</title>
                <desc id="trend-desc">A line rises from 24 to 92 across seven measurement points.</desc>
                <defs><linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#6356e8" stopOpacity=".5"/><stop offset="1" stopColor="#6356e8" stopOpacity="0"/></linearGradient></defs>
                {[35, 80, 125, 170].map((y) => <line key={y} x1="0" x2="480" y1={y} y2={y} stroke="white" strokeOpacity=".08" />)}
                <path className="signal-area" d="M0 151 C52 145 62 124 114 127 S183 105 230 112 S300 84 343 88 S414 43 480 31 V180 H0Z" fill="url(#trend-area)" />
                <path className="signal-line" d="M0 151 C52 145 62 124 114 127 S183 105 230 112 S300 84 343 88 S414 43 480 31" fill="none" stroke="#8b7ff5" strokeWidth="5" strokeLinecap="round" />
              </svg>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5 md:p-6">
              <span className="text-[11px] text-white/45">Priority impact</span><p className="mt-1 text-sm font-bold">Fixes by potential</p>
              <div className="mt-8 flex h-40 items-end gap-2" aria-label="Seven illustrative opportunity bars">
                {bars.map((height, index) => <span key={height} className="signal-bar flex-1 rounded-t bg-gradient-to-t from-[#4b42b8] to-[#8b7ff5]" style={{ height: `${height}%`, animationDelay: `${index * 90 + 250}ms` }} />)}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs"><span className="text-white/45">Potential uplift</span><strong className="inline-flex items-center gap-1 text-[#a9a1ff]">High <ArrowUpRight className="size-3" /></strong></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
