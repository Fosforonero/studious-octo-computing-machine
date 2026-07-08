import { signup } from "./actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; checkEmail?: string }> }) {
  const { error, checkEmail } = await searchParams;

  if (checkEmail) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="mt-4 text-sm">We sent a confirmation link — click it to activate your account.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold">Sign up</h1>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-red-600">{error}</p>}
      <form action={signup} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" name="email" required className="rounded border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input type="password" name="password" required minLength={6} className="rounded border px-3 py-2" />
        </label>
        <button type="submit" className="mt-2 rounded bg-primary px-4 py-2 text-sm font-bold text-foreground">Sign up</button>
      </form>
      <p className="mt-6 text-sm">Already have an account? <a href="/login" className="underline">Log in</a></p>
    </main>
  );
}
