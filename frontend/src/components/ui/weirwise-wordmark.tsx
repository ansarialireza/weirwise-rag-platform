import Image from "next/image";
import { cn } from "@/lib/utils";

interface WeirwiseWordmarkProps {
  className?: string;
  priority?: boolean;
}

export function WeirwiseWordmark({ className, priority = false }: WeirwiseWordmarkProps) {
  return (
    <span className={cn("inline-flex w-36 shrink-0", className)} aria-label="Weirwise">
      <Image
        src="/weirwise-horizontal.svg"
        alt="Weirwise"
        width={1060}
        height={200}
        priority={priority}
        className="hidden h-auto w-full dark:block"
      />
      <Image
        src="/weirwise-horizontal-light.svg"
        alt="Weirwise"
        width={1060}
        height={200}
        priority={priority}
        className="block h-auto w-full dark:hidden"
      />
    </span>
  );
}
