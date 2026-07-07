"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/brand";

const steps = ["Opening desktop and mobile browsers", "Reading content and page structure", "Following key conversion paths", "Running technical checks", "Asking specialist reviewers", "Prioritizing the action plan"];

export function AuditPending({ id, initialStatus, errorMessage }: { id: string; initialStatus: "pending" | "running" | "failed"; errorMessage?: string | null }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (initialStatus === "failed") return;
    const timer = window.setInterval(async () => {
      setElapsed((value) => value + 1);
      const response = await fetch(`/api/audits/${id}`, { cache: "no-store" });
      if (!response.ok) return;
      const audit = await response.json() as { status: string };
      if (audit.status === "completed" || audit.status === "failed") router.refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, initialStatus, router]);
  const active = Math.min(steps.length - 1, Math.floor(elapsed / 3));

  return <main className="hero-glow grid-noise min-h-screen px-5 py-8 text-white"><div className="mx-auto max-w-3xl"><Brand inverted /><div className="mt-24 rounded-3xl border border-white/10 bg-white/[.04] p-7 backdrop-blur md:p-12">{initialStatus === "failed" ? <><span className="eyebrow">Audit stopped</span><h1 className="display mt-6 text-6xl">We hit a snag.</h1><p className="mt-5 max-w-xl text-white/60">{errorMessage ?? "The website could not be audited. Please try again."}</p><Link className="mt-8 inline-flex rounded-full bg-primary px-6 py-3 text-sm font-bold text-foreground" href="/#audit">Try another URL</Link></> : <><div className="flex items-center gap-4"><LoaderCircle className="size-8 animate-spin text-primary" /><div><span className="text-xs font-bold uppercase tracking-widest text-primary">Audit in progress</span><h1 className="mt-1 text-2xl font-bold">We&apos;re looking at your website now.</h1></div></div><div className="mt-10 space-y-3">{steps.map((step, index) => <div key={step} className={`flex items-center gap-4 rounded-xl border p-4 ${index <= active ? "border-primary/20 bg-primary/5" : "border-white/5 opacity-40"}`}><span className={`grid size-7 place-items-center rounded-full ${index < active ? "bg-primary text-foreground" : "border border-white/20"}`}>{index < active ? <Check className="size-4" /> : <span className="text-xs">{index + 1}</span>}</span><span className="text-sm font-bold">{step}</span></div>)}</div><p className="mt-8 text-center text-xs text-white/40">The report refreshes automatically. This usually takes about two minutes.</p></>}</div></div></main>;
}
