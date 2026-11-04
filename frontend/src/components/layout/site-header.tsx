"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n/context";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { Menu, X, Download, Sun, Moon, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  className?: string;
}

export function SiteHeader({ className }: SiteHeaderProps) {
  const { user } = useAuth();
  const { dict } = useI18n();
  const { theme, setTheme } = useTheme();
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
              className="inline-block h-1.5 w-1.5 rounded-none bg-[#46C7D6]"
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

        {/* Mobile Header Controls: Hamburger Menu / Close Icon ONLY */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-none border border-zinc-800 bg-transparent text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors focus:outline-none"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950/98 backdrop-blur-xl animate-in slide-in-from-top-2 duration-150 shadow-2xl">
          <div ref={menuRef} className="px-6 py-8 space-y-8 max-w-sm">
            {/* Primary Navigation Links: Sharp brutalist typography, generous spacing, strict left-alignment */}
            <div className="flex flex-col space-y-5 text-left">
              {primaryLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between text-2xl font-bold tracking-tight transition-colors text-left",
                    link.active
                      ? "text-white"
                      : "text-zinc-400 hover:text-white"
                  )}
                >
                  <span>{link.label}</span>
                  {link.active && <span className="h-2 w-2 rounded-none bg-[#CCFF00]" />}
                </Link>
              ))}

              <Link
                href={dashboardUrl || "/login"}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center justify-between text-2xl font-bold tracking-tight transition-colors text-left",
                  authOrDashboardLink.active
                    ? "text-white"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <span>{authOrDashboardLink.label}</span>
                {authOrDashboardLink.active && <span className="h-2 w-2 rounded-none bg-[#CCFF00]" />}
              </Link>
            </div>

            {/* Language Switcher directly below links */}
            <div className="pt-2 text-left">
              <LanguageSwitcher variant="minimal" />
            </div>

            {/* Bottom Controls / Preferences Section */}
            <div className="space-y-4 pt-6 border-t border-zinc-800/80 text-left">
              {isInstallable && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full flex items-center justify-between py-2 border-b border-zinc-800 text-zinc-300 hover:text-white transition-colors text-xs font-mono"
                >
                  <span className="flex items-center gap-2">
                    <Download className="h-3.5 w-3.5 text-[#CCFF00]" />
                    {dict.common.installApp}
                  </span>
                  <span className="text-[10px] uppercase text-zinc-500 font-mono">PWA</span>
                </button>
              )}

              {/* Minimal Brutalist Theme Switcher */}
              <div className="flex flex-col gap-2 pt-1 text-left">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  {dict.common.theme}
                </span>
                <div className="flex items-center gap-3 font-mono text-xs select-none">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex items-center gap-1.5 transition-colors py-0.5",
                      theme === "light"
                        ? "text-[#CCFF00] font-bold"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    <span>Light</span>
                  </button>
                  <span className="text-zinc-700 select-none text-[11px]">/</span>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex items-center gap-1.5 transition-colors py-0.5",
                      theme === "dark"
                        ? "text-[#CCFF00] font-bold"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    <span>Dark</span>
                  </button>
                  <span className="text-zinc-700 select-none text-[11px]">/</span>
                  <button
                    type="button"
                    onClick={() => setTheme("system")}
                    className={cn(
                      "flex items-center gap-1.5 transition-colors py-0.5",
                      theme === "system"
                        ? "text-[#CCFF00] font-bold"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Laptop className="h-3.5 w-3.5" />
                    <span>System</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
