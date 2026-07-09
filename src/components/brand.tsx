import Link from "next/link";
import Image from "next/image";

export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" aria-label="Lensiq home" className={`inline-flex items-center gap-3 ${inverted ? "text-white" : "text-foreground"}`}>
      <span className="grid size-10 overflow-hidden rounded-xl bg-white shadow-sm">
        <Image src="/lensiq-favicon.webp" alt="" width={386} height={386} priority className="h-full w-full object-cover" />
      </span>
      <span className="text-[1.65rem] font-medium leading-none tracking-[-0.01em]">
        lensi<span className="bg-gradient-to-br from-[#2f6de1] to-[#8b2bdb] bg-clip-text text-transparent">q</span>
      </span>
    </Link>
  );
}
