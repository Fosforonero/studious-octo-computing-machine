import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:-translate-y-0.5 hover:brightness-105",
      dark: "bg-foreground text-background hover:-translate-y-0.5 hover:bg-foreground/90",
      outline: "border border-border bg-transparent hover:bg-muted",
      ghost: "hover:bg-muted",
    },
    size: { default: "h-11 px-6", sm: "h-9 px-4 text-xs", lg: "h-14 px-8 text-base", icon: "size-10 p-0" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export function Button({ className, variant, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
