"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Bot,
  Database,
  MessageSquare,
  Settings,
  X,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Plus,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { PreferenceControls } from "@/components/ui/preference-controls";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";
import { InstallAppButton } from "@/components/ui/install-app-button";
import { WorkspaceBillingStatus } from "@/types";

interface SidebarProps {
  onItemClick?: () => void;
  onClose?: () => void;
  isMobileDrawer?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  onItemClick,
  onClose,
  isMobileDrawer = false,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { dict } = useI18n();

  const [billing, setBilling] = useState<WorkspaceBillingStatus | null>(null);

  // Load billing overview directly for user
  useEffect(() => {
    let active = true;
    api
      .getUserBilling()
      .then((b) => {
        if (active) setBilling(b);
      })
      .catch(() => {
        /* Non-critical */
      });
    return () => {
      active = false;
    };
  }, []);

  const navItems = [
    { label: dict.common.overview, href: "/overview", icon: LayoutDashboard, active: pathname === "/overview" },
    { label: dict.common.knowledge, href: "/sources", icon: Database, active: pathname.startsWith("/sources") },
    { label: dict.common.assistants, href: "/assistants", icon: Bot, active: pathname.startsWith("/assistants") },
    { label: dict.common.playground, href: "/playground", icon: MessageSquare, active: pathname.startsWith("/playground") },
    { label: dict.common.settings, href: "/settings", icon: Settings, active: pathname.startsWith("/settings") },
  ];



  const queriesUsed = billing?.chat_turns_used ?? 0;
  const queriesLimit = billing?.chat_turns_limit ?? 100;
  const queryPercent = Math.min(100, Math.round((queriesUsed / Math.max(1, queriesLimit)) * 100));

  const isCollapsedMode = collapsed && !isMobileDrawer;

  return (
    <aside
      className={cn(
        "flex select-none flex-col border-border bg-card transition-[width] duration-200",
        isMobileDrawer ? "h-full w-full" : isCollapsedMode ? "h-screen w-[68px] border-r" : "h-screen w-[248px] border-r"
      )}
      aria-label={dict.common.mainNavigation}
    >
      {/* Brand Header & Collapse Toggle */}
      <div className={cn("flex h-16 shrink-0 items-center justify-between px-3", isCollapsedMode && "justify-center px-0")}>
        <Link
          href="/overview"
          onClick={() => onItemClick?.()}
          className={cn("group flex items-center gap-2.5", isCollapsedMode ? "justify-center" : "px-1")}
          title={dict.common.brand}
        >
          <WeirwiseMark className="h-7 w-auto shrink-0" />
          {!isCollapsedMode && (
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              Weirwise
            </span>
          )}
        </Link>

        {isMobileDrawer && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={dict.common.closeNavigation}
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          !isMobileDrawer &&
          onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isCollapsedMode && "hidden group-hover:flex"
              )}
              title={isCollapsedMode ? dict.common.expandSidebar : dict.common.collapseSidebar}
              aria-label={isCollapsedMode ? dict.common.expandSidebar : dict.common.collapseSidebar}
            >
              {isCollapsedMode ? (
                <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" />
              ) : (
                <PanelLeftClose className="h-4 w-4 rtl:rotate-180" />
              )}
            </button>
          )
        )}
      </div>



      {/* Main Nav Items */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {!isCollapsedMode && (
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-label text-muted-foreground">
            Platform
          </p>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onItemClick?.()}
              aria-current={item.active ? "page" : undefined}
              title={isCollapsedMode ? item.label : undefined}
              className={cn(
                "group relative flex min-h-10 items-center gap-3 rounded-lg text-[13px] transition-colors",
                isCollapsedMode ? "justify-center px-0" : "px-3",
                item.active
                  ? "bg-muted font-medium text-foreground"
                  : "font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {item.active && (
                <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-signal" aria-hidden="true" />
              )}
              <Icon className={cn("h-[18px] w-[18px] shrink-0", item.active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")} />
              {!isCollapsedMode && <span>{item.label}</span>}
            </Link>
          );
        })}

        {user?.is_superuser && (
          <>
            {!isCollapsedMode && (
              <p className="px-3 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-label text-muted-foreground">
                {dict.common.administration}
              </p>
            )}
            <Link
              href="/admin"
              onClick={() => onItemClick?.()}
              title={isCollapsedMode ? dict.common.admin : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg text-[13px] transition-colors",
                isCollapsedMode ? "justify-center px-0" : "px-3",
                pathname.startsWith("/admin")
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-[18px] w-[18px] shrink-0" />
              {!isCollapsedMode && <span>{dict.common.admin}</span>}
            </Link>
          </>
        )}
      </nav>

      {/* Quota / Usage Box (shown when not collapsed) */}
      {!isCollapsedMode && (
        <div className="px-3 pb-2">
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1 font-medium text-foreground">
                <Zap className="h-3 w-3 text-signal" />
                <span>{dict.common.usage}</span>
              </div>
              <Link href="/pricing" className="text-[10px] font-semibold text-primary hover:underline">
                {dict.common.upgrade}
              </Link>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Queries</span>
                <span>{queriesUsed} / {queriesLimit}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-signal transition-all duration-300"
                  style={{ width: `${queryPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User, Install App & Controls */}
      <div
        className={cn("shrink-0 space-y-2 border-t border-border p-3", isCollapsedMode && "p-2")}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {user && (
          <div
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 p-2",
              isCollapsedMode && "justify-center p-1 border-0 bg-transparent"
            )}
            title={user.email}
          >
            <div className={cn("flex min-w-0 flex-1 items-center gap-2", isCollapsedMode && "justify-center flex-none")}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-onyx text-[11px] font-semibold text-white">
                {(user.full_name?.charAt(0) || user.email?.charAt(0) || "U").toUpperCase()}
              </span>
              {!isCollapsedMode && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium leading-tight text-foreground">
                    {user.full_name || user.email.split("@")[0]}
                  </div>
                  <div className="truncate text-[10px] leading-tight text-muted-foreground">
                    {user.email}
                  </div>
                </div>
              )}
            </div>
            {!isCollapsedMode && (
              <button
                type="button"
                onClick={() => logout()}
                title={dict.common.signOut}
                aria-label={dict.common.signOut}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5 rtl:rotate-180" />
              </button>
            )}
          </div>
        )}

        {!isCollapsedMode ? (
          <>
            <InstallAppButton variant="row" className="min-h-10 py-1.5 text-[12px]" />
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <span className="text-[11px] text-muted-foreground">{dict.common.theme}</span>
              <PreferenceControls />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => logout()}
              title={dict.common.signOut}
              aria-label={dict.common.signOut}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
