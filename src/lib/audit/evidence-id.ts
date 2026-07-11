import { hashContent } from "@/lib/audit/evidence-sanitize";
import type { EvidenceId } from "@/lib/audit/evidence-types";

// Deterministic: same category + same stable key parts always produce the same id, so
// citing "cta:9f3ab21c4e01" remains meaningful even if array order changes between runs
// or re-renders. Never derived from an array index or a random value.
export function makeEvidenceId(category: string, ...keyParts: string[]): EvidenceId {
  return `${category}:${hashContent(keyParts.join("|")).slice(0, 12)}`;
}
