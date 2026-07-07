export type AuditStatus = "pending" | "running" | "completed" | "failed";
export type Impact = "critical" | "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";
export type ExpertKey = "conversion" | "ux" | "copywriting" | "seo" | "performance" | "accessibility" | "trust" | "mobile";

export interface ExtractedPage {
  url: string;
  title: string;
  metaDescription: string;
  headings: { level: number; text: string }[];
  visibleText: string;
  ctas: { text: string; href: string; tag: string }[];
  ctaJourneys: { text: string; destination: string; outcome: string; sameOrigin: boolean }[];
  links: { text: string; href: string }[];
  forms: { action: string; inputs: string[] }[];
  aboveFold: { text: string; ctas: string[]; imageCount: number };
  landmarks: { hasNav: boolean; hasFooter: boolean; hasMain: boolean };
  trustSignals: string[];
  domSummary: { elements: number; images: number; buttons: number; links: number; forms: number };
  desktopScreenshotPath?: string;
  mobileScreenshotPath?: string;
}

export interface AuditMetrics {
  performanceScore: number;
  accessibilityScore: number;
  seoScore: number;
  bestPracticesScore: number;
  lcp: number | null;
  cls: number | null;
  inpOrTbt: number | null;
  ttfb: number | null;
  imageIssues: string[];
  renderBlockingResources: number;
  scriptWeightBytes: number;
  raw?: unknown;
}

export interface Finding {
  title: string;
  evidence: string;
  impact: Impact;
  effort: Effort;
  recommendation: string;
}

export interface ExpertReport {
  key: ExpertKey;
  score: number;
  summary: string;
  findings: Finding[];
  quickWins: string[];
}

export interface CopySuggestion { label: "headline" | "subheadline" | "cta" | "hero"; before: string; after: string; rationale: string; }

export interface FinalReport {
  overallScore: number;
  executiveSummary: string;
  priorities: Finding[];
  sections: ExpertReport[];
  copySuggestions: CopySuggestion[];
  quickWins: string[];
  longTermImprovements: string[];
}

export interface AuditRecord {
  id: string;
  url: string;
  normalizedUrl: string;
  pageGoal: string;
  status: AuditStatus;
  overallScore: number | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  page?: ExtractedPage;
  metrics?: AuditMetrics;
  report?: FinalReport;
}
