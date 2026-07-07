import { accessibilityPrompt } from "./accessibility";
import { conversionPrompt } from "./conversion";
import { copywritingPrompt } from "./copywriting";
import { mobilePrompt } from "./mobile";
import { performancePrompt } from "./performance";
import { seoPrompt } from "./seo";
import { trustPrompt } from "./trust";
import { uxPrompt } from "./ux";
import type { ExpertKey } from "@/lib/audit/types";

export const expertPrompts: Record<ExpertKey, string> = { conversion: conversionPrompt, ux: uxPrompt, copywriting: copywritingPrompt, seo: seoPrompt, performance: performancePrompt, accessibility: accessibilityPrompt, trust: trustPrompt, mobile: mobilePrompt };
