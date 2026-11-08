"use client";

import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface SiteFooterProps {
  className?: string;
}

export function SiteFooter({ className }: SiteFooterProps) {
  const { dict } = useI18n();

  return (
    <footer className={cn("border-t border-border/60 bg-background/50", className)}>
      <div className="mx-auto flex w-full max-w-content items-center justify-center py-6 px-4 sm:px-6 lg:px-10">
        <p className="text-[12px] text-muted-foreground text-center">
          {dict.landing.copyright}
        </p>
      </div>
    </footer>
  );
}
