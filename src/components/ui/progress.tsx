import { cn } from "@/lib/utils";

export function Progress({ value = 0, className, "aria-label": ariaLabel }: { value?: number; className?: string; "aria-label"?: string }) {
  return <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={ariaLabel}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
