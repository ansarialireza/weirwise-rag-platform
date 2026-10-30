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
}

export function Sidebar({
  currentWorkspace,
  currentProject,
  workspaces,
  projects,
  onItemClick,
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
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card transition-colors select-none">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <Link
          href={baseProjUrl ? `${baseProjUrl}/overview` : "/"}
          className="flex items-center gap-3 group"
        >
          <WeirwiseSymbol className="h-8 w-8" />
          <span className="text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
            Weirwise
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        </Link>
      </div>

      {/* Scope Pickers: Workspace & Project */}
      <div className="p-3.5 space-y-2 border-b border-border/80 bg-card/40 text-xs">
        {/* Workspace Dropdown */}
        <div className="relative">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Workspace
          </label>
          <button
            type="button"
            onClick={() => {
              setWsDropdownOpen(!wsDropdownOpen);
              setProjDropdownOpen(false);
            }}
            className="w-full flex items-center justify-between rounded-md border border-border/70 bg-secondary/40 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary hover:border-border transition-colors focus:outline-none"
          >
            <span className="truncate">{currentWorkspace?.name || "Select Workspace"}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", wsDropdownOpen && "rotate-180")} />
          </button>

          {wsDropdownOpen && workspaces.length > 0 && (
            <div className="absolute left-0 right-0 mt-1.5 z-30 rounded-lg border border-border bg-card shadow-xl py-1 max-h-56 overflow-y-auto text-xs">
              {workspaces.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/workspaces/${ws.id}`}
                  onClick={() => setWsDropdownOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 transition-colors hover:bg-secondary",
                    ws.id === wsId ? "text-primary font-bold bg-primary/10" : "text-foreground"
                  )}
                >
                  <span className="truncate">{ws.name}</span>
                  {ws.id === wsId && <span className="h-2 w-2 rounded-full bg-primary" />}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Project Dropdown */}
        {currentWorkspace && (
          <div className="relative">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Project
            </label>
            <button
              type="button"
              onClick={() => {
                setProjDropdownOpen(!projDropdownOpen);
                setWsDropdownOpen(false);
              }}
              className="w-full flex items-center justify-between rounded-md border border-border/70 bg-secondary/40 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary hover:border-border transition-colors focus:outline-none"
            >
              <span className="truncate">{currentProject?.name || "Select Project"}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", projDropdownOpen && "rotate-180")} />
            </button>

            {projDropdownOpen && projects.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 z-30 rounded-lg border border-border bg-card shadow-xl py-1 max-h-56 overflow-y-auto text-xs">
                {projects.map((proj) => (
                  <Link
                    key={proj.id}
                    href={`/workspaces/${wsId}/projects/${proj.id}/overview`}
                    onClick={() => setProjDropdownOpen(false)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 transition-colors hover:bg-secondary",
                      proj.id === pId ? "text-primary font-bold bg-primary/10" : "text-foreground"
                    )}
                  >
                    <span className="truncate">{proj.name}</span>
                    {proj.id === pId && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Command Palette Shortcut Trigger */}
      <div className="px-3.5 pt-3">
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
          }}
          className="w-full flex items-center justify-between rounded-lg border border-border/80 bg-input/70 px-3 py-2 text-xs text-muted-foreground hover:bg-input hover:text-foreground transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span>Search &amp; Jump</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-secondary text-[10px] font-mono">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Main Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/40 cursor-not-allowed"
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                item.active
                  ? "bg-secondary text-primary font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", item.active ? "text-primary" : "text-muted-foreground")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Discreet Theme Preference Footer */}
      <div className="border-t border-border p-3.5 space-y-2.5 bg-card/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary border border-border text-xs font-bold text-foreground flex-shrink-0">
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus:outline-none"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Compact, discreet theme selector */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground font-medium">Appearance</span>
          <CompactThemeMenu />
        </div>
      </div>
    </aside>
  );
}
