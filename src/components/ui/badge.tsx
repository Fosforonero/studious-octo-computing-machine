import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", { variants: { variant: { default: "bg-primary text-primary-foreground", secondary: "bg-muted text-foreground", outline: "border bg-transparent", danger: "bg-red-100 text-red-800", warning: "bg-amber-100 text-amber-900" } }, defaultVariants: { variant: "default" } });
export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }
