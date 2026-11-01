"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  Database,
  Sliders,
  Settings,
  LogOut,
  ChevronDown,
  Search,
  X,
  Plus,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Workspace, Project } from "@/types";
import { CompactThemeMenu } from "@/components/ui/compact-theme-menu";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { useState } from "react";

interface SidebarProps {
  currentWorkspace: Workspace | null;
  currentProject: Project | null;
  workspaces: Workspace[];
  projects: Project[];
  onItemClick?: () => void;
  onClose?: () => void;
  isMobileDrawer?: boolean;
}

export function Sidebar({
  currentWorkspace,
  currentProject,
  workspaces,
  projects,
  onItemClick,
  onClose,
  isMobileDrawer = false,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [projDropdownOpen, setProjDropdownOpen] = useState(false);

  const wsId = currentWorkspace?.id;
  const pId = currentProject?.id;

  const baseProjUrl = wsId && pId ? `/workspaces/${wsId}/projects/${pId}` : "";
  const baseWsUrl = wsId ? `/workspaces/${wsId}` : "";

  const navItems = [
    {
      label: "Overview",
      href: baseProjUrl ? `${baseProjUrl}/overview` : "#",
      icon: LayoutDashboard,
      active: pathname.endsWith("/overview") || (baseProjUrl && pathname === baseProjUrl),
      disabled: !baseProjUrl,
    },
    {
      label: "Knowledge",
      href: baseProjUrl ? `${baseProjUrl}/sources` : "#",
      icon: Database,
      active: pathname.includes("/sources"),
      disabled: !baseProjUrl,
    },
    {
      label: "Assistants",
      href: baseProjUrl ? `${baseProjUrl}/assistants` : "#",
      icon: Bot,
      active: pathname.includes("/assistants") && !pathname.includes("/playground"),
      disabled: !baseProjUrl,
    },
    {
      label: "Playground",
      href: baseProjUrl ? `${baseProjUrl}/playground` : "#",
      icon: Sliders,
      active: pathname.includes("/playground"),
      disabled: !baseProjUrl,
    },
    {
      label: "Settings",
      href: baseWsUrl ? `${baseWsUrl}/settings` : "#",
      icon: Settings,
      active: pathname.includes("/settings"),
      disabled: !baseWsUrl,
    },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border/40 bg-card/60 backdrop-blur-md transition-colors select-none",
        isMobileDrawer ? "h-full w-full" : "h-screen w-64"
      )}
      aria-label="Workspace Navigation Sidebar"
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-5 shrink-0 border-b border-border/40">
        <Link
          href={baseProjUrl ? `${baseProjUrl}/overview` : "/"}
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
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none"
            aria-label="Close navigation drawer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Scope Pickers: Sleek Minimalist Switcher */}
      <div className="p-3.5 space-y-1.5 shrink-0">
        {/* Workspace Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setWsDropdownOpen(!wsDropdownOpen);
              setProjDropdownOpen(false);
            }}
            className="w-full flex items-center justify-between rounded-xl bg-muted/40 hover:bg-muted/80 px-3 py-2 text-xs font-semibold text-foreground transition-colors focus:outline-none"
            aria-expanded={wsDropdownOpen}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              <span className="truncate">{currentWorkspace?.name || "Select Workspace"}</span>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", wsDropdownOpen && "rotate-180")} />
          </button>

          {wsDropdownOpen && workspaces.length > 0 && (
            <div className="absolute left-0 right-0 mt-1.5 z-40 rounded-2xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-xl p-1.5 max-h-56 overflow-y-auto text-xs animate-in fade-in-50 zoom-in-95">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workspaces
              </div>
              {workspaces.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/workspaces/${ws.id}`}
                  onClick={() => {
                    setWsDropdownOpen(false);
                    onItemClick?.();
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors",
                    ws.id === wsId ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-muted"
                  )}
                >
                  <span className="truncate">{ws.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Project Dropdown */}
        {wsId && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProjDropdownOpen(!projDropdownOpen);
                setWsDropdownOpen(false);
              }}
              className="w-full flex items-center justify-between rounded-xl bg-muted/40 hover:bg-muted/80 px-3 py-2 text-xs font-semibold text-foreground transition-colors focus:outline-none"
              aria-expanded={projDropdownOpen}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Proj:</span>
                <span className="truncate font-medium">{currentProject?.name || "Select Project"}</span>
              </div>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", projDropdownOpen && "rotate-180")} />
            </button>

            {projDropdownOpen && projects.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 z-40 rounded-2xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-xl p-1.5 max-h-56 overflow-y-auto text-xs animate-in fade-in-50 zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Projects
                </div>
                {projects.map((proj) => (
                  <Link
                    key={proj.id}
                    href={`/workspaces/${wsId}/projects/${proj.id}/overview`}
                    onClick={() => {
                      setProjDropdownOpen(false);
                      onItemClick?.();
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors",
                      proj.id === pId ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span className="truncate">{proj.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Search Shortcut */}
      <div className="px-3.5 pb-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
            onItemClick?.();
          }}
          className="w-full flex items-center justify-between rounded-xl bg-muted/30 hover:bg-muted/70 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">Quick search</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded-md bg-background/80 text-[10px] font-mono text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Main Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground/30 cursor-not-allowed"
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => onItemClick?.()}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition-all",
                item.active
                  ? "bg-muted text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", item.active ? "text-primary" : "text-muted-foreground")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sleek User Profile & Appearance Footer */}
      <div className="p-3.5 space-y-2.5 border-t border-border/40 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground shrink-0">
              {user?.full_name?.charAt(0) || "U"}
            </div>
            <div className="flex flex-col truncate">
              <span className="text-xs font-semibold text-foreground truncate">
                {user?.full_name || "User"}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">
                {user?.email || "Account"}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus:outline-none"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Compact theme selector */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground font-medium">Appearance</span>
          <CompactThemeMenu />
        </div>
      </div>
    </aside>
  );
}
