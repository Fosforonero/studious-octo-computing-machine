"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { claimPendingAudit } from "@/lib/audit/pending-claim";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  const claim = await claimPendingAudit(data.user.id);
  if (claim.status === "claimed") redirect(`/audits/${claim.auditId}`);
  if (claim.status === "invalid-url") redirect(`/dashboard?error=${encodeURIComponent("We couldn't start an audit for that website. Please try again.")}`);
  redirect("/dashboard");
}
