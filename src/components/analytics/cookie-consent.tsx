"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";

type Consent = "granted" | "denied" | "unset";

const STORAGE_KEY = "lensiq-consent";

function getSnapshot(): Consent {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : "unset";
}

function getServerSnapshot(): Consent {
  return "unset";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function CookieConsent({ measurementId }: { measurementId?: string }) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [override, setOverride] = useState<Consent | null>(null);
  const consent = override ?? stored;

  function decide(value: Exclude<Consent, "unset">) {
    window.localStorage.setItem(STORAGE_KEY, value);
    setOverride(value);
  }

  return (
    <>
      {consent === "granted" && <GoogleAnalytics measurementId={measurementId} />}
      {consent === "unset" && (
        <div role="dialog" aria-live="polite" aria-label="Cookie preferences" className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b1220] px-5 py-5 text-white shadow-2xl md:px-8">
          <div className="mx-auto flex max-w-[1180px] flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl text-xs leading-6 text-white/70">
              We use a small number of cookies to understand how visitors use lensiq.site. We only set analytics cookies after you accept. See our{" "}
              <Link href="/cookies" className="font-bold text-white underline underline-offset-2">Cookie Policy</Link>{" "}for details.
            </p>
            <div className="flex shrink-0 gap-3">
              <button type="button" onClick={() => decide("denied")} className="rounded-full border border-white/20 px-5 py-2.5 text-xs font-bold text-white/80 transition hover:bg-white/5">Reject</button>
              <button type="button" onClick={() => decide("granted")} className="rounded-full bg-white px-5 py-2.5 text-xs font-bold text-[#0b1220] transition hover:bg-white/90">Accept</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
