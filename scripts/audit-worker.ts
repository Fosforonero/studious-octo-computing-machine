import { processNextAudit } from "../src/lib/audit/process-audit";

const once = process.argv.includes("--once");
const parsedPollMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
if (!Number.isFinite(parsedPollMs) || parsedPollMs < 100) {
  console.error(`[lensiq-worker] WORKER_POLL_INTERVAL_MS is invalid (${process.env.WORKER_POLL_INTERVAL_MS}); it must be a number >= 100.`);
  process.exit(1);
}
const pollMs = parsedPollMs;

async function run() {
  console.log(`[lensiq-worker] started (${once ? "once" : `poll ${pollMs}ms`})`);
  do {
    try {
      const result = await processNextAudit();
      if (result) console.log(`[lensiq-worker] ${result.id}: ${result.status}`);
      else if (once) console.log("[lensiq-worker] no pending audits");
    } catch (error) {
      console.error("[lensiq-worker] poll failed", error);
      if (once) process.exitCode = 1;
    }
    if (!once) await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (!once);
}

void run();
