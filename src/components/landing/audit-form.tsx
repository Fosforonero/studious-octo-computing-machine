"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AuditForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pageGoal, setPageGoal] = useState("get-leads");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/audits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, pageGoal }) });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error ?? "Could not start the audit.");
      router.push(`/audits/${data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setPending(false);
    }
  }

  return <form onSubmit={submit} className={compact ? "w-full" : "mx-auto w-full max-w-3xl"}>
    <div className="flex flex-col gap-2 rounded-[1.35rem] bg-white p-2 shadow-2xl shadow-black/20 md:flex-row md:rounded-full">
      <Input aria-label="Website URL" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourwebsite.com" className="h-13 flex-1 border-0 bg-transparent text-foreground focus:ring-0" />
      <label className="sr-only" htmlFor={`page-goal-${compact ? "compact" : "full"}`}>Primary page goal</label>
      <select id={`page-goal-${compact ? "compact" : "full"}`} value={pageGoal} onChange={(event) => setPageGoal(event.target.value)} className="h-13 rounded-full border-0 bg-[#f0f2f8] px-5 text-sm font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:max-w-48">
        <option value="get-leads">Get leads</option>
        <option value="book-demos">Book demos</option>
        <option value="sell">Sell a product</option>
        <option value="signups">Drive signups</option>
        <option value="inform">Explain / inform</option>
      </select>
      <Button size="lg" className="h-13 shrink-0" disabled={pending} aria-label={pending ? "Starting your audit" : undefined}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <>Run free audit <ArrowRight className="size-4" /></>}</Button>
    </div>
    <div className={`mt-3 flex items-center ${error ? "justify-between" : "justify-center"} gap-3 text-xs ${compact ? "text-muted-foreground" : "text-white/55"}`}>
      <span className="inline-flex items-center gap-1.5"><LockKeyhole className="size-3" /> No signup · Homepage only · About 2 minutes</span>
      {error && <span role="alert" className="font-bold text-red-400">{error}</span>}
    </div>
  </form>;
}
