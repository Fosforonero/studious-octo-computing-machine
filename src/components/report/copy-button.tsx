"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable, ignore */ }
  }

  return (
    <button type="button" onClick={handleCopy} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
