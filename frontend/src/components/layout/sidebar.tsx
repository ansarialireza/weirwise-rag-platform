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
import { Workspace, WorkspaceBillingStatus } from "@/types";

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

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [billing, setBilling] = useState<WorkspaceBillingStatus | null>(null);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [isCreatingWs, setIsCreatingWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close workspace dropdown on outside click
  useEffect(() => {
    if (!wsDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWsDropdownOpen(false);
        setIsCreatingWs(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wsDropdownOpen]);

  // Load workspaces and billing
  useEffect(() => {
    let active = true;
    api
      .getWorkspaces()
      .then(async (list) => {
        if (!active || !list) return;
        setWorkspaces(list);
        const activeId = api.getWorkspaceId();
        const ws = list.find((w) => w.id === activeId) || list[0];
        if (ws) {
          setActiveWorkspace(ws);
          try {
            const b = await api.getWorkspaceBilling(ws.id);
            if (active) setBilling(b);
          } catch {
            // Optional billing metric fallback
          }
        }
      })
      .catch(() => {
        /* Non-critical */
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSelectWorkspace = (ws: Workspace) => {
    api.setWorkspaceId(ws.id);
    setActiveWorkspace(ws);
    setWsDropdownOpen(false);
    window.location.reload();
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    try {
      const created = await api.createWorkspace(newWsName.trim());
      setWorkspaces((prev) => [...prev, created]);
      handleSelectWorkspace(created);
    } catch {
      // Failed to create workspace
    }
  };

  const navItems = [
    { label: dict.common.overview, href: "/overview", icon: LayoutDashboard, active: pathname === "/overview" },
    { label: dict.common.knowledge, href: "/sources", icon: Database, active: pathname.startsWith("/sources") },
    { label: dict.common.assistants, href: "/assistants", icon: Bot, active: pathname.startsWith("/assistants") },
    { label: dict.common.playground, href: "/playground", icon: MessageSquare, active: pathname.startsWith("/playground") },
    { label: dict.common.settings, href: "/settings", icon: Settings, active: pathname.startsWith("/settings") },
  ];

  const planLabels: Record<string, string> = {
    free: dict.common.freePlan,
    starter: dict.common.starterPlan,
    pro: dict.common.proPlan,
    enterprise: dict.common.businessPlan,
  };
  const planLabel = activeWorkspace?.plan_tier
    ? planLabels[activeWorkspace.plan_tier] || activeWorkspace.plan_tier
    : dict.common.workspace;

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

      {/* Workspace Switcher */}
      <div className={cn("relative px-3 pb-3", isCollapsedMode && "px-2 pb-2")} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setWsDropdownOpen((prev) => !prev)}
          className={cn(
            "group flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 transition-colors hover:bg-muted/70",
            isCollapsedMode ? "h-10 justify-center p-0" : "px-3 py-2 text-left"
          )}
          title={activeWorkspace?.name || dict.common.workspace}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-onyx text-[10px] font-semibold text-white">
            {(activeWorkspace?.name || "W").charAt(0).toUpperCase()}
          </span>
          {!isCollapsedMode && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium leading-tight text-foreground">
                  {activeWorkspace?.name || dict.common.workspace}
                </div>
                <div className="truncate text-[11px] leading-tight text-muted-foreground">
                  {planLabel}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
                  wsDropdownOpen && "rotate-180"
                )}
              />
            </>
          )}
        </button>

        {/* Dropdown Menu */}
        {wsDropdownOpen && (
          <div
            className={cn(
              "absolute z-50 rounded-xl border border-border bg-popover p-1.5 shadow-lift animate-in",
              isCollapsedMode
                ? "start-full top-0 ms-2 w-56"
                : "start-3 end-3 top-full mt-1.5"
            )}
          >
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {dict.common.switchWorkspace}
            </div>

            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSelectWorkspace(ws)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] transition-colors",
                    ws.id === activeWorkspace?.id
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <span className="truncate">{ws.name}</span>
                  {ws.id === activeWorkspace?.id && <Check className="h-3.5 w-3.5 shrink-0 ms-1.5" />}
                </button>
              ))}
            </div>

            <div className="mt-1 border-t border-border pt-1">
              {!isCreatingWs ? (
                <button
                  type="button"
                  onClick={() => setIsCreatingWs(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{dict.common.createWorkspace}</span>
                </button>
              ) : (
                <form onSubmit={handleCreateWorkspace} className="p-1 space-y-1.5">
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="Workspace name"
                    autoFocus
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setIsCreatingWs(false)}
                      className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newWsName.trim()}
                      className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Create
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Nav Items */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {!isCollapsedMode && (
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-label text-muted-foreground">
            {dict.common.workspace}
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
