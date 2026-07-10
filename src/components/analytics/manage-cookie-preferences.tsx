"use client";

import { CONSENT_STORAGE_KEY } from "@/lib/analytics/consent";

export function ManageCookiePreferences() {
  function reset() {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={reset}
      className="rounded-full border border-foreground/30 px-5 py-2.5 text-xs font-bold text-foreground transition hover:bg-foreground/5"
    >
      Manage cookie preferences
    </button>
  );
}
