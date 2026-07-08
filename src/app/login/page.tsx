import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold">Log in</h1>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-red-600">{error}</p>}
      <form action={login} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" name="email" required className="rounded border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input type="password" name="password" required className="rounded border px-3 py-2" />
        </label>
        <button type="submit" className="mt-2 rounded bg-primary px-4 py-2 text-sm font-bold text-foreground">Log in</button>
      </form>
      <p className="mt-6 text-sm">No account? <a href="/signup" className="underline">Sign up</a></p>
    </main>
  );
}
