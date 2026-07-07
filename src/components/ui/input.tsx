import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn("flex h-12 w-full rounded-full border border-input bg-card px-5 text-base outline-none transition placeholder:text-muted-foreground focus:border-foreground focus:ring-2 focus:ring-ring/30 disabled:opacity-50", className)} {...props} />;
}
