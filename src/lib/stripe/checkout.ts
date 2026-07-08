import { getStripe } from "@/lib/stripe/client";
import { claimCheckoutSession, getAudit } from "@/lib/db/audits";

export interface CheckoutResult { url: string | null; alreadyPaid: boolean; }

function createSession(auditId: string, idempotencyKey: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lensiq.site";
  return getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "usd", unit_amount: 2900, product_data: { name: "Lensiq full audit report" } }, quantity: 1 }],
    success_url: `${appUrl}/audits/${auditId}?checkout=success`,
    cancel_url: `${appUrl}/audits/${auditId}?checkout=cancelled`,
    metadata: { auditId },
  }, { idempotencyKey });
}

// At most one open, payable Checkout Session per unpaid audit — reuses an existing open
// session, creates a fresh one once the previous session expired, and resolves a
// double-click/double-tab race by conditionally claiming the session id in the database
// (see claimCheckoutSession): the request that loses the race reuses the winner's session
// instead of leaving a second, orphaned payable session for the same audit.
export async function getOrCreateCheckoutSession(auditId: string): Promise<CheckoutResult> {
  const audit = await getAudit(auditId);
  if (!audit) throw new Error("Audit not found.");
  if (audit.paid) return { url: null, alreadyPaid: true };

  let idempotencyKey = `audit-checkout-${auditId}-initial`;
  let previousSessionId: string | null = null;
  if (audit.stripeCheckoutSessionId) {
    const existing = await getStripe().checkout.sessions.retrieve(audit.stripeCheckoutSessionId);
    if (existing.status === "open") return { url: existing.url, alreadyPaid: false };
    if (existing.status === "complete") return { url: null, alreadyPaid: true };
    // status === "expired": fall through and create a replacement session, keyed off the
    // expired session's id so retries of this same replacement don't spawn duplicates.
    idempotencyKey = `audit-checkout-${auditId}-after-${existing.id}`;
    previousSessionId = existing.id;
  }

  const session = await createSession(auditId, idempotencyKey);
  const claimed = await claimCheckoutSession(auditId, session.id, previousSessionId);
  if (claimed) return { url: session.url, alreadyPaid: false };

  // Lost the race — another request already recorded a session first. Reuse theirs.
  const winner = await getAudit(auditId);
  if (winner?.paid) return { url: null, alreadyPaid: true };
  if (winner?.stripeCheckoutSessionId) {
    const winnerSession = await getStripe().checkout.sessions.retrieve(winner.stripeCheckoutSessionId);
    if (winnerSession.status === "open") return { url: winnerSession.url, alreadyPaid: false };
    if (winnerSession.status === "complete") return { url: null, alreadyPaid: true };
  }
  return { url: session.url, alreadyPaid: false };
}
