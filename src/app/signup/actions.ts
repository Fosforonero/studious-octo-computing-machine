"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lensiq.site";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${appUrl}/auth/confirm` },
  });

  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);

  redirect("/signup?checkEmail=1");
}
