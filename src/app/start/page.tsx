import { AuditForm } from "@/components/landing/audit-form";
import { startAudit } from "./actions";

export default function StartPage() {
  return (
    <main className="hero-glow grid-noise min-h-screen px-5 py-16 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="display text-4xl md:text-5xl">Start your audit</h1>
        <p className="mt-4 text-white/70">Enter your website below.</p>
        <div className="mt-10">
          <AuditForm onSubmit={startAudit} helperText="We'll ask you to create a free account before the audit starts." ctaLabel="Start my audit" />
        </div>
      </div>
    </main>
  );
}
