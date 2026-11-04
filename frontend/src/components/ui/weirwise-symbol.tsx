import Image from "next/image";
import { cn } from "@/lib/utils";

interface WeirwiseSymbolProps {
  className?: string;
  variant?: "two-tone" | "monochrome";
  surface?: "theme" | "dark";
  size?: number | string;
  priority?: boolean;
}

export function WeirwiseSymbol({ className, surface = "theme", priority = false }: WeirwiseSymbolProps) {
  return (
    <span
      className={cn(
        "inline-flex aspect-[820/560] w-auto shrink-0 items-center justify-center",
        className
      )}
      aria-hidden="true"
    >
      <Image
        src="/weirwise-symbol.svg"
        alt=""
        width={820}
        height={560}
        priority={priority}
        className={cn("h-full w-full object-contain", surface === "dark" ? "block" : "hidden dark:block")}
      />
      <Image
        src="/weirwise-symbol-light.svg"
        alt=""
        width={820}
        height={560}
        priority={priority}
        className={cn("h-full w-full object-contain", surface === "dark" ? "hidden" : "block dark:hidden")}
      />
    </span>
  );
}
