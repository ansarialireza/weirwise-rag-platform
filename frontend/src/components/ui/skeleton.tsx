import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative overflow-hidden rounded-lg bg-muted", className)}
    >
      <div className="absolute inset-y-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-card/70 to-transparent" />
    </div>
  );
}
