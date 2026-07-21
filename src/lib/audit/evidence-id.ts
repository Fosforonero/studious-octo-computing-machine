import { hashContent } from "@/lib/audit/evidence-sanitize";
import type { EvidenceId } from "@/lib/audit/evidence-types";

// Deterministic: same category + same stable key parts always produce the same id, so
// citing "cta:9f3ab21c4e01" remains meaningful even if array order changes between runs
// or re-renders. Never derived from an array index or a random value.
export function makeEvidenceId(category: string, ...keyParts: string[]): EvidenceId {
  return `${category}:${hashContent(keyParts.join("|")).slice(0, 12)}`;
}

// Two distinct DOM elements can legitimately share the same stable key (e.g. two
// identically-labeled buttons pointing at the same destination) — makeEvidenceId alone
// would then produce a genuine collision, breaking the "cite unambiguously" guarantee.
// Called once per collection, in stable extraction order, so the Nth occurrence of a
// given id always gets the same "-2", "-3", ... suffix on a repeat run of the same page.
export function dedupeEvidenceIds<T extends { evidenceId: EvidenceId }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = seen.get(item.evidenceId) ?? 0;
    seen.set(item.evidenceId, count + 1);
    return count === 0 ? item : { ...item, evidenceId: `${item.evidenceId}-${count + 1}` };
  });
}
