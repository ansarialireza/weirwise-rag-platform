"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { Menu, X, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  className?: string;
}

export function SiteHeader({ className }: SiteHeaderProps) {
  const { user } = useAuth();
  const { dict } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const dashboardUrl = user ? "/overview" : null;

  // Listen for beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choiceResult = await installPrompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      setIsInstallable(false);
      setInstallPrompt(null);
    }
  };

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
    { label: dict.common.pricing, href: "/pricing", active: pathname === "/pricing" },
    { label: dict.common.blog, href: "/blog", active: pathname.startsWith("/blog") },
  ];

  const authOrDashboardLink = dashboardUrl
    ? { label: dict.common.overview, href: dashboardUrl, active: pathname.startsWith("/overview") }
    : { label: dict.common.signIn, href: "/login", active: pathname === "/login" };

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

          <div className="ps-2 pe-1 border-s border-zinc-800 flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </nav>

        {/* Mobile Header Controls: Language switcher, Clean Sign In link + Hamburger Menu Button */}
        <div className="flex md:hidden items-center gap-2.5">
          <LanguageSwitcher />
          <Link
            href={authOrDashboardLink.href}
            className={cn(
              "text-xs sm:text-sm font-medium transition-colors px-2 py-1 rounded-sm text-zinc-300 hover:text-white active:scale-98",
              authOrDashboardLink.active && "text-white font-semibold"
            )}
          >
            {authOrDashboardLink.label}
          </Link>

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
          <div ref={menuRef} className="px-5 py-6 space-y-6 max-w-sm mx-auto">
            <div className="space-y-1.5">
              {primaryLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-3.5 py-3 rounded-md text-base sm:text-lg font-semibold tracking-tight transition-colors",
                    link.active
                      ? "bg-zinc-900/80 text-white font-bold"
                      : "text-zinc-300 hover:bg-zinc-900/50 hover:text-white"
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
                  "flex items-center justify-between px-3.5 py-3 rounded-md text-base sm:text-lg font-semibold tracking-tight transition-colors",
                  authOrDashboardLink.active
                    ? "bg-zinc-900/80 text-white font-bold"
                    : "text-zinc-300 hover:bg-zinc-900/50 hover:text-white"
                )}
              >
                <span>{authOrDashboardLink.label}</span>
                {authOrDashboardLink.active && <span className="h-1.5 w-1.5 rounded-full bg-[#46C7D6]" />}
              </Link>
            </div>

            {/* Polished Theme Toggle & Install Section */}
            <div className="space-y-2">
              {isInstallable && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full flex items-center justify-between p-3 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 text-white transition-all text-xs font-mono font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Download className="h-3.5 w-3.5 text-[#46C7D6]" />
                    {dict.common.installApp}
                  </span>
                  <span className="text-[10px] uppercase text-zinc-400">Native</span>
                </button>
              )}

              <div className="p-3 rounded-md border border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  {dict.common.appearance}
                </span>
                <ThemeSwitcher />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
