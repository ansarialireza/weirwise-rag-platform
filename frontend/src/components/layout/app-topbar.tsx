"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Search, Settings as SettingsIcon, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { ModKey } from "@/components/ui/mod-key";
import { PreferenceControls } from "@/components/ui/preference-controls";
import { WeirwiseWordmark } from "@/components/ui/weirwise-wordmark";

interface AppTopbarProps {
  onOpenMenu?: () => void;
  onOpenSearch: () => void;
}

function getPageLabel(pathname: string, dict: ReturnType<typeof useI18n>["dict"]) {
  if (pathname.startsWith("/assistants/")) return dict.common.assistant;
  if (pathname.startsWith("/assistants")) return dict.common.assistants;
  if (pathname.startsWith("/sources")) return dict.common.knowledge;
  if (pathname.startsWith("/playground")) return dict.common.playground;
  if (pathname.startsWith("/settings")) return dict.common.settings;
  return dict.common.overview;
}

function getInitials(user: { full_name?: string | null; email?: string | null } | null): string {
  if (user?.full_name?.trim()) {
    const parts = user.full_name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (user?.email) {
    const namePart = user.email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
    return (namePart.slice(0, 2) || "U").toUpperCase();
  }
  return "U";
}

export function AppTopbar({ onOpenMenu, onOpenSearch }: AppTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { dict } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  const pageLabel = getPageLabel(pathname, dict);
  const initials = getInitials(user);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/85 px-3.5 backdrop-blur-md sm:h-14 sm:px-6">
      {/* Start / Left: Brand on Mobile, Page Title on Desktop */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile-first brand section */}
        <Link
          href="/overview"
          className="flex items-center transition-opacity hover:opacity-90 active:scale-95"
          aria-label="Weirwise"
        >
          <WeirwiseWordmark className="h-6" />
        </Link>

        {/* Separator and Desktop Page Title */}
        <span className="hidden h-4 w-px bg-border/80 md:block" aria-hidden="true" />
        <span className="hidden truncate text-sm font-semibold tracking-tight text-foreground md:inline-block">
          {pageLabel}
        </span>
      </div>

      {/* End / Right: Quick Search and Circular Avatar Touch Target */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Quick Search trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{dict.common.quickSearch}</span>
          <kbd className="ms-2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
            <ModKey />
          </kbd>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 sm:h-9 sm:w-9 sm:rounded-lg"
          aria-label={dict.common.search}
        >
          <Search className="h-4 w-4" />
        </button>

        {/* User Account Quick Access with 44x44px minimum touch target */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-auto sm:px-1.5 sm:rounded-lg"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={dict.common.accountMenu}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-onyx text-[12px] font-semibold text-white shadow-sm ring-1 ring-border sm:h-7 sm:w-7 sm:text-[11px]">
              {initials}
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute end-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-lift animate-in"
            >
              <div className="border-b border-border px-3 py-2.5">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {user?.full_name || user?.email?.split("@")[0] || dict.common.user}
                </div>
                <div className="truncate text-[11px] text-muted-foreground font-mono">{user?.email}</div>
              </div>

              {/* Quick Navigation Items */}
              <div className="py-1 border-b border-border/70">
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-muted"
                >
                  <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{dict.common.settings}</span>
                </Link>
                <Link
                  href="/settings/billing"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-muted"
                >
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span>Billing & Plans</span>
                </Link>
              </div>

              <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
                <span className="text-[12px] text-muted-foreground">
                  {dict.common.theme} / {dict.common.language}
                </span>
                <PreferenceControls />
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className={cn(
                  "mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                )}
              >
                <LogOut className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                {dict.common.signOut}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
