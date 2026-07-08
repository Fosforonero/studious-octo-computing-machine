import { NextResponse } from "next/server";
import { z } from "zod";
import { createAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";
import { getOrCreateCheckoutSession } from "@/lib/stripe/checkout";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ url: z.string().trim().min(3).max(2048), pageGoal: z.enum(["get-leads", "book-demos", "sell", "signups", "inform"]) });

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid website URL." }, { status: 400 });
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = await assertSafeUrl(body.url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid website URL." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims.sub as string | undefined) ?? null;

  try {
    const audit = await createAudit(body.url, normalizedUrl, body.pageGoal, userId);
    let checkoutUrl: string | null = null;
    try {
      const result = await getOrCreateCheckoutSession(audit.id);
      checkoutUrl = result.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("STRIPE_SECRET_KEY is missing") && !message.includes("STRIPE_PRICE_SINGLE_AUDIT is missing")) console.error("[api/audits] getOrCreateCheckoutSession failed", error);
    }
    return NextResponse.json({ id: audit.id, status: audit.status, checkoutUrl }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Supabase is not configured")) return NextResponse.json({ error: "Live audits are not configured yet. Open the sample report instead." }, { status: 503 });
    console.error("[api/audits] createAudit failed", error);
    return NextResponse.json({ error: "Could not create the audit. Please try again." }, { status: 500 });
  }
}
