import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  const email = data.claims.email as string;

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-red-600">{error}</p>}
      <p className="mt-4 text-sm">Logged in as {email}</p>
      <form action={logout} className="mt-8">
        <button type="submit" className="rounded border px-4 py-2 text-sm font-bold">Log out</button>
      </form>
    </main>
  );
}
