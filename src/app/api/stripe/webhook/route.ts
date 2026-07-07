import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { markAuditPaid } from "@/lib/db/audits";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, request.headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET ?? "");
  } catch (error) {
    console.error("[api/stripe/webhook] signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const auditId = session.metadata?.auditId;
    if (auditId) {
      try {
        await markAuditPaid(auditId, session.id);
      } catch (error) {
        console.error(`[api/stripe/webhook] markAuditPaid failed for ${auditId}`, error);
      }
    }
  }

  return NextResponse.json({ received: true });
}
