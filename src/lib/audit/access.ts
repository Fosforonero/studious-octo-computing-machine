import { createClient } from "@/lib/supabase/server";
import { getOwnedAuditSummary } from "@/lib/db/audits";
import type { AuditRecord } from "@/lib/audit/types";

export type AuditAccessResult =
  | { kind: "unauthenticated" }
  | { kind: "not-found" }
  | { kind: "ok"; audit: AuditRecord; userId: string };

export async function resolveAuditAccess(id: string): Promise<AuditAccessResult> {
  const supabase = await createClient();
  let userId: string | undefined;
  try {
    const { data: claims, error } = await supabase.auth.getClaims();
    if (error) {
      // getClaims() returns { data, error } — a returned error is not the same as a
      // thrown exception, and both must fail closed. Log only the message, never the
      // full error object, a JWT, or a cookie.
      console.error(`[audit-access] getClaims returned an error for ${id}`, error.message);
    } else {
      userId = claims?.claims.sub as string | undefined;
    }
  } catch (error) {
    console.error(`[audit-access] getClaims threw for ${id}`, error instanceof Error ? error.message : error);
  }
  if (!userId) return { kind: "unauthenticated" };

  // Not wrapped in try/catch: a genuine DB error here is not "you don't own this" and
  // must propagate to the caller, which keeps its own error-boundary/500 convention —
  // see Global Constraints.
  const audit = await getOwnedAuditSummary(id, userId);
  if (!audit) return { kind: "not-found" };
  return { kind: "ok", audit, userId };
}
