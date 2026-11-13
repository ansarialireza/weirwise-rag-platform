"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface SiteFooterProps {
  className?: string;
}

export function SiteFooter({ className }: SiteFooterProps) {
  const { dict } = useI18n();

  return (
    <footer className={cn("border-t border-border/60 bg-background/50", className)}>
      <div className="mx-auto flex w-full max-w-wide flex-col items-center justify-between gap-4 py-8 px-4 sm:flex-row sm:px-6 lg:px-10">
        <p className="text-[12px] text-muted-foreground order-2 sm:order-1 text-center sm:text-start">
          {dict.landing.copyright} · {dict.landing.footerStatus}
        </p>
        <nav aria-label="Legal & Information" className="flex items-center gap-6 order-1 sm:order-2 text-[12px] font-medium text-muted-foreground">
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground underline-offset-4 hover:underline"
          >
            {dict.landing.privacyPolicy}
          </Link>
          <Link
            href="/terms"
            className="transition-colors hover:text-foreground underline-offset-4 hover:underline"
          >
            {dict.landing.termsOfService}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
