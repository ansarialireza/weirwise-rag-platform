"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  className?: string;
}

export function SiteHeader({ className }: SiteHeaderProps) {
  const { user, loading } = useAuth();
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && user) {
      api
        .getWorkspaces()
        .then((workspaces) => {
          if (workspaces.length > 0) {
            setDashboardUrl(`/workspaces/${workspaces[0].id}`);
          }
        })
        .catch(() => {});
    }
  }, [user, loading]);

  // Close mobile menu when pathname changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Handle escape key and lock scroll on mobile menu open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { label: "Pricing", href: "/pricing", active: pathname === "/pricing" },
    ...(dashboardUrl
      ? [{ label: "Dashboard", href: dashboardUrl, active: pathname.startsWith("/workspaces") }]
      : [{ label: "Sign In", href: "/login", active: pathname === "/login" }]),
  ];

  return (
    <header
      className={cn(
        "w-full border-b border-border/80 bg-background/90 backdrop-blur-md sticky top-0 z-40 transition-colors",
        className
      )}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        {/* Brand identity on the left: Balanced, intentional, clean */}
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group shrink-0 select-none">
          <WeirwiseSymbol className="h-7 w-7 sm:h-8 sm:w-8" />
          <span className="font-bold text-sm sm:text-base tracking-tight text-foreground flex items-center gap-1.5">
            Weirwise
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
              title="Platform online"
              aria-hidden="true"
            />
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-3 lg:gap-4 text-xs font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "whitespace-nowrap px-2 py-1.5 rounded-md transition-colors",
                link.active
                  ? "text-foreground font-semibold bg-secondary/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              )}
            >
              {link.label}
            </Link>
          ))}

          <div className="pl-1">
            <ThemeSwitcher />
          </div>

          <Link
            href={dashboardUrl || "/register"}
            className="whitespace-nowrap rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-1.5"
          >
            <span>{dashboardUrl ? "Open Studio" : "Get Started"}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </nav>

        {/* Mobile Header Controls: Theme Switcher & Menu Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeSwitcher />

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-card text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Accessible Mobile Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-card/98 backdrop-blur-xl animate-in slide-in-from-top-2 duration-150 shadow-xl">
          <div ref={menuRef} className="px-4 py-4 space-y-3 max-w-sm mx-auto">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    link.active
                      ? "bg-secondary text-primary font-semibold"
                      : "text-foreground hover:bg-secondary/70 hover:text-foreground"
                  )}
                >
                  <span>{link.label}</span>
                  {link.active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </Link>
              ))}
            </div>

            <div className="pt-2 border-t border-border">
              <Link
                href={dashboardUrl || "/register"}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 active:scale-[0.98] transition-all"
              >
                <span>{dashboardUrl ? "Open Studio" : "Get Started Free"}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
