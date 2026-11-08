"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { PreferenceControls } from "@/components/ui/preference-controls";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";
import { InstallAppButton } from "@/components/ui/install-app-button";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  className?: string;
}

export function SiteHeader({ className }: SiteHeaderProps) {
  const { user, loading: authLoading } = useAuth();
  const { dict } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuthenticated = mounted && !authLoading && Boolean(user);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const links = [
    { label: dict.common.howItWorks, href: "/#how-it-works" },
    { label: dict.common.pricing, href: "/pricing" },
    { label: dict.common.blog, href: "/blog" },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur-md",
        className
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-content items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="flex shrink-0 select-none items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <WeirwiseMark className="h-7 w-auto" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            {dict.common.brand}
          </span>
        </Link>

        <nav
          aria-label={dict.common.mainNavigation}
          className="hidden items-center gap-7 text-sm md:flex"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Action group on desktop: clean & focused on navigation & conversion */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 md:flex">
            {mounted && !authLoading ? (
              isAuthenticated ? (
                <Link
                  href="/overview"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  {dict.common.openWorkspace}
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {dict.common.signIn}
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    {dict.landing.primaryCta}
                  </Link>
                </>
              )
            ) : (
              <span className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? dict.common.closeNavigation : dict.common.openNavigation}
            aria-expanded={mobileMenuOpen}
            aria-controls="site-mobile-menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 top-16 z-30 bg-background/70 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            id="site-mobile-menu"
            className="fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border bg-card px-4 pb-8 pt-2 shadow-lift md:hidden"
          >
            <nav aria-label={dict.common.mainNavigation} className="flex flex-col">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between border-b border-border/60 py-3.5 text-[15px] font-medium text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-6 space-y-2.5">
              {mounted && !authLoading ? (
                isAuthenticated ? (
                  <Link
                    href="/overview"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground"
                  >
                    {dict.common.openWorkspace}
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                    >
                      {dict.common.signIn}
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {dict.landing.primaryCta}
                    </Link>
                  </>
                )
              ) : (
                <div className="h-11 w-full animate-pulse rounded-xl bg-muted" />
              )}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="text-xs text-muted-foreground">{dict.common.language} / {dict.common.theme}</span>
              <PreferenceControls />
            </div>

            <InstallAppButton variant="row" className="mt-4" />
          </div>
        </>
      )}
    </header>
  );
}
