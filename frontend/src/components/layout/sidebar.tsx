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
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { CompactThemeMenu } from "@/components/ui/compact-theme-menu";
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

  const navItems = [
    {
      label: "Overview",
      href: "/overview",
      icon: LayoutDashboard,
      active: pathname === "/overview" || pathname === "/",
    },
    {
      label: "Knowledge",
      href: "/sources",
      icon: Database,
      active: pathname.startsWith("/sources"),
    },
    {
      label: "Assistants",
      href: "/assistants",
      icon: Bot,
      active: pathname.startsWith("/assistants"),
    },
    {
      label: "Playground",
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
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
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
        className="p-3 border-t border-border/40 shrink-0 relative"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden text-left p-1 rounded-md flex-1 mr-1">
            {/* Brutalist Stark Square graphic instead of circular avatar */}
            <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 font-mono text-xs font-bold text-[#46C7D6] shrink-0">
              {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex flex-col truncate min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">
                {user?.full_name || "User"}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground truncate">
                {user?.email || "Account"}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent hover:border-zinc-800 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus:outline-none"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Compact theme selector */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground font-medium">Appearance</span>
          <CompactThemeMenu />
        </div>
      </div>
    </aside>
  );
}
