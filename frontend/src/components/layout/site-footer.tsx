"use client";

import { PreferenceControls } from "@/components/ui/preference-controls";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface SiteFooterProps {
  className?: string;
}

export function SiteFooter({ className }: SiteFooterProps) {
  const { dict } = useI18n();

  return (
    <footer className={cn("border-t border-border/60 bg-background/50", className)}>
      <div className="mx-auto flex w-full max-w-content flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6 lg:px-10">
        <p className="text-[12px] text-muted-foreground order-2 sm:order-1">
          {dict.landing.copyright}
        </p>
        <div className="order-1 sm:order-2 flex items-center gap-2">
          <PreferenceControls />
        </div>
      </div>
    </footer>
  );
}
