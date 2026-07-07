import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";

export function SiteHeader({ dark = true }: { dark?: boolean }) {
  return <header className={`absolute inset-x-0 top-0 z-20 ${dark ? "text-white" : "text-foreground"}`}><div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-6 md:px-10"><Brand inverted={dark} /><nav className="hidden items-center gap-8 text-xs font-bold uppercase tracking-wider md:flex"><Link href="/#how">How it works</Link><Link href="/#inside">What you get</Link><Link href="/audits/demo">Sample report</Link></nav><Link href="/#audit" className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider ${dark ? "bg-white text-foreground" : "bg-foreground text-white"}`}>Audit my site <ArrowUpRight className="size-3.5" /></Link></div></header>;
}
