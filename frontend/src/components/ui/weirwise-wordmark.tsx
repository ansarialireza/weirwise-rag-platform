import { cn } from "@/lib/utils";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";

interface WeirwiseWordmarkProps {
  className?: string;
}

export function WeirwiseWordmark({ className }: WeirwiseWordmarkProps) {
  return (
    <span className={cn("inline-flex select-none items-center gap-2", className)} aria-label="Weirwise">
      <WeirwiseMark className="h-5 w-auto" />
      <span
        aria-hidden="true"
        className="font-display text-[15px] font-semibold leading-none tracking-display text-foreground"
      >
        Weirwise
      </span>
    </span>
  );
}
