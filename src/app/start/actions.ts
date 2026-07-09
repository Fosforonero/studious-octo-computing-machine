"use server";

import { randomUUID } from "node:crypto";
import { createAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";
import { setPendingAuditCookie, PAGE_GOALS, type PageGoal } from "@/lib/audit/pending-claim";
import { createClient } from "@/lib/supabase/server";

export async function startAudit(url: string, pageGoal: string): Promise<{ redirect: string } | { error: string }> {
  if (!PAGE_GOALS.includes(pageGoal as PageGoal)) return { error: "Choose a valid page goal." };

  let normalizedUrl: string;
  try {
    normalizedUrl = await assertSafeUrl(url);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Enter a valid website URL." };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims.sub as string | undefined) ?? null;

  if (userId) {
    try {
      const audit = await createAudit(url, normalizedUrl, pageGoal, userId);
      return { redirect: `/audits/${audit.id}` };
    } catch {
      return { error: "Could not start the audit. Please try again." };
    }
  }

  await setPendingAuditCookie({ auditId: randomUUID(), url, pageGoal: pageGoal as PageGoal });
  return { redirect: "/signup" };
}
