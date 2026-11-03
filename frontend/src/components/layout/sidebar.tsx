"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  Database,
  Sliders,
  LogOut,
  X,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";

interface SidebarProps {
  onItemClick?: () => void;
  onClose?: () => void;
  isMobileDrawer?: boolean;
}

export function Sidebar({
  onItemClick,
  onClose,
  isMobileDrawer = false,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { dict } = useI18n();

  const navItems = [
    {
      label: dict.common.overview,
      href: "/overview",
      icon: LayoutDashboard,
      active: pathname === "/overview" || pathname === "/",
    },
    {
      label: dict.common.knowledge,
      href: "/sources",
      icon: Database,
      active: pathname.startsWith("/sources"),
    },
    {
      label: dict.common.assistants,
      href: "/assistants",
      icon: Bot,
      active: pathname.startsWith("/assistants"),
    },
    {
      label: dict.common.playground,
      href: "/playground",
      icon: Sliders,
      active: pathname.startsWith("/playground"),
    },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border/40 bg-card/60 backdrop-blur-md transition-colors select-none",
        isMobileDrawer ? "h-full w-full" : "h-screen w-64"
      )}
      aria-label="Application Navigation Sidebar"
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-5 shrink-0 border-b border-border/40">
        <Link
          href="/overview"
          onClick={() => onItemClick?.()}
          className="flex items-center gap-2.5 group"
        >
          <WeirwiseSymbol className="h-7 w-auto transition-transform group-hover:scale-105" priority />
          <span className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
            Weirwise
            <span className="h-1.5 w-1.5 rounded-none bg-[#46C7D6]" aria-hidden="true" />
          </span>
        </Link>

        {isMobileDrawer && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors focus:outline-none"
            aria-label="Close navigation drawer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Main Nav Items */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => onItemClick?.()}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-xs transition-all",
                item.active
                  ? "bg-zinc-900 text-white font-semibold border border-zinc-700 shadow-xs"
                  : "text-zinc-400 hover:bg-zinc-900/50 hover:text-white border border-transparent font-medium"
              )}
            >
              <Icon className={cn("h-4 w-4", item.active ? "text-[#46C7D6]" : "text-zinc-400")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom User Profile Section */}
      <div
        className="p-3 border-t border-zinc-800 shrink-0 relative space-y-2.5 bg-zinc-950/40"
        style={{ paddingBottom: "max(0.85rem, env(safe-area-inset-bottom))" }}
      >
        {/* User Profile Block */}
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center gap-2.5 overflow-hidden text-start min-w-0 flex-1">
            {/* Geometric Sharp Initial Box */}
            <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 font-mono text-xs font-semibold text-[#46C7D6] shrink-0 select-none shadow-xs">
              {user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex flex-col truncate min-w-0 pe-1">
              <span className="text-xs font-medium text-zinc-200 truncate leading-snug">
                {user?.full_name || dict.common.user}
              </span>
              <span className="text-[11px] font-mono text-zinc-500 truncate leading-tight">
                {user?.email || dict.common.account}
              </span>
            </div>
          </div>

          {/* Sharp Hoverable Square Logout Action */}
          <button
            type="button"
            onClick={logout}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800/80 bg-zinc-950/60 text-zinc-400 hover:text-white hover:bg-zinc-800/80 hover:border-zinc-700 active:scale-95 transition-all focus:outline-none"
            title={dict.common.signOut}
            aria-label={dict.common.signOut}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Brutalist Language Switcher Control */}
        <LanguageSwitcher variant="sidebar" />

        {/* Structured Theme / Appearance Segmented Control */}
        <div className="rounded-md border border-zinc-800/80 bg-zinc-900/30 p-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 ps-1">
            {dict.common.theme}
          </span>
          <div className="flex items-center gap-0.5 rounded-sm border border-zinc-800/90 bg-zinc-950/80 p-0.5">
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-xs transition-colors",
                theme === "dark"
                  ? "bg-zinc-800 text-white font-medium shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
              )}
              title="Dark Mode"
              aria-label="Dark Mode"
            >
              <Moon className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-xs transition-colors",
                theme === "light"
                  ? "bg-zinc-800 text-white font-medium shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
              )}
              title="Light Mode"
              aria-label="Light Mode"
            >
              <Sun className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("system")}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-xs transition-colors",
                theme === "system"
                  ? "bg-zinc-800 text-white font-medium shadow-xs"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
              )}
              title="System Theme"
              aria-label="System Theme"
            >
              <Laptop className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
