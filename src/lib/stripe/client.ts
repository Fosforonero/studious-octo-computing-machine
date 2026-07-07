import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe() {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing.");
  client = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  return client;
}
