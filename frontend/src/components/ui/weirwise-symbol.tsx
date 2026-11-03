import Image from "next/image";
import { cn } from "@/lib/utils";

interface WeirwiseSymbolProps {
  className?: string;
  variant?: "two-tone" | "monochrome";
  size?: number | string;
  priority?: boolean;
}

export function WeirwiseSymbol({ className, priority = false }: WeirwiseSymbolProps) {
  return (
    <span
      className={cn(
        "inline-flex aspect-[350/170] w-auto shrink-0 items-center justify-center",
        className
      )}
      aria-hidden="true"
    >
      <Image
        src="/weirwise-symbol.svg"
        alt=""
        width={350}
        height={170}
        priority={priority}
        className="hidden h-full w-full object-contain dark:block"
      />
      <Image
        src="/weirwise-symbol-light.svg"
        alt=""
        width={350}
        height={170}
        priority={priority}
        className="block h-full w-full object-contain dark:hidden"
      />
    </span>
  );
}
