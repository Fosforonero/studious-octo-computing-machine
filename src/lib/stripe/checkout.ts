import { getStripe } from "@/lib/stripe/client";

export async function createCheckoutSession(auditId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lensiq.site";
  return getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "usd", unit_amount: 2900, product_data: { name: "Lensiq full audit report" } }, quantity: 1 }],
    success_url: `${appUrl}/audits/${auditId}?checkout=success`,
    cancel_url: `${appUrl}/audits/${auditId}?checkout=cancelled`,
    metadata: { auditId },
  });
}
