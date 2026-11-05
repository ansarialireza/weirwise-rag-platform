"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Bot,
  Database,
  MessageSquare,
  X,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { PreferenceControls } from "@/components/ui/preference-controls";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";
import { InstallAppButton } from "@/components/ui/install-app-button";

interface SidebarProps {
  onItemClick?: () => void;
  onClose?: () => void;
  isMobileDrawer?: boolean;
}

export function Sidebar({ onItemClick, onClose, isMobileDrawer = false }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { dict } = useI18n();
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getWorkspaces()
      .then((list) => {
        if (!active) return;
        const activeId = api.getWorkspaceId();
        const ws = list.find((w) => w.id === activeId) || list[0];
        if (ws) {
          setWorkspaceName(ws.name);
          setPlanTier(ws.plan_tier);
        }
      })
      .catch(() => {
        /* Non-critical: workspace label falls back to the product name. */
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
  ];

  const planLabels: Record<string, string> = {
    free: dict.common.freePlan,
    starter: dict.common.starterPlan,
    pro: dict.common.proPlan,
    enterprise: dict.common.businessPlan,
  };
  const planLabel = planTier ? planLabels[planTier] || planTier : dict.common.workspace;

  return (
    <aside
      className={cn(
        "flex select-none flex-col border-border bg-card transition-colors",
        isMobileDrawer ? "h-full w-full" : "h-screen w-[248px] border-r"
      )}
      aria-label={dict.common.mainNavigation}
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        <Link href="/overview" onClick={() => onItemClick?.()} className="group flex items-center gap-2.5">
          <WeirwiseMark className="h-7 w-auto" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Weirwise
          </span>
        </Link>

        {isMobileDrawer && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={dict.common.closeNavigation}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-3 pb-4">
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-onyx text-[10px] font-semibold text-white">
              {(workspaceName || "W").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium leading-tight text-foreground">
                {workspaceName || dict.common.workspace}
              </div>
              <div className="truncate text-[11px] leading-tight text-muted-foreground">
                {planLabel}
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-label text-muted-foreground">
          {dict.common.workspace}
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onItemClick?.()}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors",
                item.active
                  ? "bg-muted font-medium text-foreground"
                  : "font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {item.active && (
                <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-signal" aria-hidden="true" />
              )}
              <Icon className={cn("h-[18px] w-[18px]", item.active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {user?.is_superuser && (
          <>
            <p className="px-3 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-label text-muted-foreground">
              {dict.common.administration}
            </p>
            <Link
              href="/admin"
              onClick={() => onItemClick?.()}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-[18px] w-[18px]" />
              <span>{dict.common.admin}</span>
            </Link>
          </>
        )}
      </nav>

      <div className="shrink-0 border-t border-border p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {/* Search, the account menu and sign-out all belong to the top bar; a
            second copy of each here would be three duplicated controls. */}
        <InstallAppButton variant="row" className="min-h-10 py-1.5 text-[12px]" />

        <div className="mt-2 flex items-center justify-end gap-2 px-1">
          <PreferenceControls />
        </div>
      </div>
    </aside>
  );
}
