"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  className?: string;
}

export function SiteHeader({ className }: SiteHeaderProps) {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const dashboardUrl = user ? "/overview" : null;

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

  const primaryLinks = [
    { label: "Pricing", href: "/pricing", active: pathname === "/pricing" },
    { label: "Blog", href: "/blog", active: pathname.startsWith("/blog") },
  ];

  const authOrDashboardLink = dashboardUrl
    ? { label: "Dashboard", href: dashboardUrl, active: pathname.startsWith("/overview") }
    : { label: "Sign In", href: "/login", active: pathname === "/login" };

  return (
    <header
      className={cn(
        "w-full border-b border-zinc-800/80 bg-background/90 backdrop-blur-md sticky top-0 z-40 transition-colors",
        className
      )}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        {/* Brand identity on the left: Balanced, intentional, clean */}
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group shrink-0 select-none">
          <WeirwiseSymbol className="h-7 sm:h-8 w-auto" priority />
          <span className="font-bold text-sm sm:text-base tracking-tight text-foreground flex items-center gap-1.5">
            Weirwise
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#46C7D6]"
              title="Platform online"
              aria-hidden="true"
            />
          </span>
        </Link>

        {/* Desktop Navigation: Minimal text-only links, Sign In, and Theme Toggle */}
        <nav className="hidden md:flex items-center gap-5 lg:gap-6 text-xs font-medium">
          {primaryLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "whitespace-nowrap transition-colors",
                link.active
                  ? "text-white font-semibold"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              {link.label}
            </Link>
          ))}

          <Link
            href={authOrDashboardLink.href}
            className={cn(
              "whitespace-nowrap transition-colors",
              authOrDashboardLink.active
                ? "text-white font-semibold"
                : "text-zinc-400 hover:text-white"
            )}
          >
            {authOrDashboardLink.label}
          </Link>

          <div className="pl-1 border-l border-zinc-800">
            <ThemeSwitcher />
          </div>
        </nav>

        {/* Mobile Header Controls: ONLY Hamburger Menu Button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950/98 backdrop-blur-xl animate-in slide-in-from-top-2 duration-150 shadow-xl">
          <div ref={menuRef} className="px-4 py-4 space-y-4 max-w-sm mx-auto">
            <div className="space-y-1">
              {primaryLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                    link.active
                      ? "bg-zinc-900 text-white font-semibold"
                      : "text-zinc-400 hover:bg-zinc-900/60 hover:text-white"
                  )}
                >
                  <span>{link.label}</span>
                  {link.active && <span className="h-1.5 w-1.5 rounded-full bg-[#46C7D6]" />}
                </Link>
              ))}

              <Link
                href={authOrDashboardLink.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  authOrDashboardLink.active
                    ? "bg-zinc-900 text-white font-semibold"
                    : "text-zinc-400 hover:bg-zinc-900/60 hover:text-white"
                )}
              >
                <span>{authOrDashboardLink.label}</span>
                {authOrDashboardLink.active && <span className="h-1.5 w-1.5 rounded-full bg-[#46C7D6]" />}
              </Link>
            </div>

            {/* Theme Toggle placed INSIDE the open hamburger menu */}
            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between px-3 text-xs text-zinc-400 font-mono">
              <span>Theme</span>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
