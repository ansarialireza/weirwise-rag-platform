"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { ModKey } from "@/components/ui/mod-key";

interface AppTopbarProps {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}

function getPageLabel(pathname: string, dict: ReturnType<typeof useI18n>["dict"]) {
  if (pathname.startsWith("/assistants/")) return dict.common.assistant;
  if (pathname.startsWith("/assistants")) return dict.common.assistants;
  if (pathname.startsWith("/sources")) return dict.common.knowledge;
  if (pathname.startsWith("/playground")) return dict.common.playground;
  return dict.common.overview;
}

export function AppTopbar({ onOpenMenu, onOpenSearch }: AppTopbarProps) {
  const pathname = usePathname();
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

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          aria-label={dict.common.openNavigation}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Below `md` the page heading scrolls away and the sidebar is closed, so
            the bar is the only thing left holding context. On desktop the page's
            own h1 states the title and the sidebar states the location. */}
        <span className="truncate text-sm font-medium text-foreground md:hidden">{pageLabel}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span>{dict.common.quickSearch}</span>
          <kbd className="ms-2 rounded border border-border bg-muted px-1 py-0.5 text-[10px]"><ModKey /></kbd>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
          aria-label={dict.common.search}
        >
          <Search className="h-4 w-4" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex h-9 items-center gap-2 rounded-lg px-1.5 text-sm transition-colors hover:bg-muted"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={dict.common.accountMenu}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-onyx text-[11px] font-semibold text-white">
              {user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"}
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute end-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-lift animate-in"
            >
              <div className="border-b border-border px-2.5 py-2">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {user?.full_name || dict.common.user}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{user?.email}</div>
              </div>

              {/* Administration lives in the sidebar nav, not here too. */}
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className={cn(
                  "mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground transition-colors hover:bg-muted"
                )}
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
                {dict.common.signOut}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
