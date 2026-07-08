"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/brand";

const steps = ["Opening desktop and mobile browsers", "Reading content and page structure", "Following key conversion paths", "Running technical checks", "Asking specialist reviewers", "Prioritizing the action plan"];

// Founder pricing for the first 100 audits — flip these back once the cap is reached.
const currentPrice = "9.99";
const standardPrice = "29";

const noopSubscribe = () => () => undefined;
const getSearchSnapshot = () => window.location.search;
const getServerSearchSnapshot = () => "";

export function AuditPending({ id, initialStatus, errorMessage }: { id: string; initialStatus: "pending" | "running" | "failed" | "unpaid"; errorMessage?: string | null }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [payPending, setPayPending] = useState(false);
  const [payError, setPayError] = useState("");
  const search = useSyncExternalStore(noopSubscribe, getSearchSnapshot, getServerSearchSnapshot);
  const isConfirmingPayment = initialStatus === "unpaid" && new URLSearchParams(search).get("checkout") === "success";

  useEffect(() => {
    if (initialStatus === "failed" || (initialStatus === "unpaid" && !isConfirmingPayment)) return;
    let attempts = 0;
    const maxConfirmAttempts = 10;
    const timer = window.setInterval(async () => {
      attempts += 1;
      setElapsed((value) => value + 1);
      const response = await fetch(`/api/audits/${id}`, { cache: "no-store" });
      if (!response.ok) return;
      const audit = await response.json() as { status: string; paid?: boolean };
      if (audit.status === "completed" || audit.status === "failed") { router.refresh(); return; }
      if (isConfirmingPayment) {
        if (audit.paid) { router.refresh(); return; }
        // Stripe's webhook can land after the browser redirect; stop waiting after 30s and
        // drop the query param so we don't offer a re-payable button while genuinely unpaid,
        // but also don't get stuck "confirming" forever if the webhook never arrives.
        if (attempts >= maxConfirmAttempts) { router.replace(window.location.pathname); router.refresh(); }
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, initialStatus, isConfirmingPayment, router]);
  const active = Math.min(steps.length - 1, Math.floor(elapsed / 3));

  async function pay() {
    setPayPending(true);
    setPayError("");
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ auditId: id }) });
      const data = await response.json() as { url?: string | null; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Payment is not available right now. Please try again later.");
      window.location.href = data.url;
    } catch (cause) {
      setPayError(cause instanceof Error ? cause.message : "Something went wrong.");
      setPayPending(false);
    }
  }

  return <main className="hero-glow grid-noise min-h-screen px-5 py-8 text-white"><div className="mx-auto max-w-3xl"><Brand inverted /><div className="mt-24 rounded-3xl border border-white/10 bg-white/[.04] p-7 backdrop-blur md:p-12">{initialStatus === "failed" ? <><span className="eyebrow">Audit stopped</span><h1 className="display mt-6 text-6xl">We hit a snag.</h1><p className="mt-5 max-w-xl text-white/60">{errorMessage ?? "The website could not be audited. Please try again."}</p><Link className="mt-8 inline-flex rounded-full bg-primary px-6 py-3 text-sm font-bold text-foreground" href="/#audit">Try another URL</Link></> : initialStatus === "unpaid" ? (isConfirmingPayment ? <><div className="flex items-center gap-4"><LoaderCircle className="size-8 animate-spin text-primary" /><div><span className="text-xs font-bold uppercase tracking-widest text-primary">Payment received</span><h1 className="mt-1 text-2xl font-bold">Confirming your payment…</h1></div></div><p className="mt-8 max-w-xl text-white/60">This usually takes a few seconds. Please don&apos;t close this page or pay again — we&apos;ll start your audit automatically once it&apos;s confirmed.</p></> : <><span className="eyebrow">Founding audit · 100 spots</span><h1 className="display mt-6 text-6xl">Almost there.</h1><p className="mt-5 max-w-xl text-white/60">Help shape Lensiq before public launch — complete your ${currentPrice} founding audit to begin. After the first 100, single audits will be ${standardPrice}.</p><p className="mt-3 max-w-xl text-sm text-white/40">If your report doesn&apos;t include at least 3 actionable fixes, we&apos;ll refund it.</p><button onClick={pay} disabled={payPending} className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-foreground disabled:opacity-60">{payPending ? <LoaderCircle className="size-4 animate-spin" /> : `Get my $${currentPrice} audit`}</button>{payError && <p role="alert" className="mt-4 text-sm font-bold text-red-400">{payError}</p>}</>) : <><div className="flex items-center gap-4"><LoaderCircle className="size-8 animate-spin text-primary" /><div><span className="text-xs font-bold uppercase tracking-widest text-primary">Audit in progress</span><h1 className="mt-1 text-2xl font-bold">We&apos;re looking at your website now.</h1></div></div><div className="mt-10 space-y-3">{steps.map((step, index) => <div key={step} className={`flex items-center gap-4 rounded-xl border p-4 ${index <= active ? "border-primary/20 bg-primary/5" : "border-white/5 opacity-40"}`}><span className={`grid size-7 place-items-center rounded-full ${index < active ? "bg-primary text-foreground" : "border border-white/20"}`}>{index < active ? <Check className="size-4" /> : <span className="text-xs">{index + 1}</span>}</span><span className="text-sm font-bold">{step}</span></div>)}</div><p className="mt-8 text-center text-xs text-white/40">The report refreshes automatically. This usually takes about two minutes.</p></>}</div></div></main>;
}
