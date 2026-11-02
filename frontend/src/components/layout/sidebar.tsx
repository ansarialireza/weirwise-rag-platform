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
  Check,
  Building2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Workspace, Project } from "@/types";
import { CompactThemeMenu } from "@/components/ui/compact-theme-menu";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { useState, useRef, useEffect } from "react";

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

  const [projDropdownOpen, setProjDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const projRef = useRef<HTMLDivElement>(null);

  const wsId = currentWorkspace?.id;
  const pId = currentProject?.id;

  const baseProjUrl = wsId && pId ? `/workspaces/${wsId}/projects/${pId}` : "";
  const baseWsUrl = wsId ? `/workspaces/${wsId}` : "";

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (projRef.current && !projRef.current.contains(e.target as Node)) {
        setProjDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

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

      {/* Clean Top Area: Only display Project selector if user has MORE THAN 1 project */}
      {wsId && projects.length > 1 && (
        <div className="p-3 pb-1 shrink-0" ref={projRef}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProjDropdownOpen(!projDropdownOpen)}
              className="w-full flex items-center justify-between rounded-xl bg-muted/40 hover:bg-muted/80 px-3 py-2 text-xs font-semibold text-foreground transition-colors focus:outline-none"
              aria-expanded={projDropdownOpen}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Project:</span>
                <span className="truncate font-medium">{currentProject?.name || "Select Project"}</span>
              </div>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", projDropdownOpen && "rotate-180")} />
            </button>

            {projDropdownOpen && (
              <div className="absolute left-0 right-0 mt-1.5 z-40 rounded-2xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-xl p-1.5 max-h-56 overflow-y-auto text-xs animate-in fade-in-50 zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Projects ({projects.length})
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
                    {proj.id === pId && <Check className="h-3.5 w-3.5 shrink-0 ml-2" />}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Search Shortcut */}
      <div className="px-3 pt-3 pb-1 shrink-0">
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

      {/* Bottom User Profile Section with Integrated Workspace Switcher */}
      <div className="p-3 border-t border-border/40 shrink-0 relative" ref={userMenuRef}>
        {/* Workspace Switcher Popover from User Profile (Only shown if > 1 workspace exists) */}
        {userMenuOpen && workspaces.length > 1 && (
          <div className="absolute bottom-full left-3 right-3 mb-2 z-50 rounded-2xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl p-2 space-y-2 animate-in fade-in-50 zoom-in-95">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Workspaces</span>
              <span className="font-mono text-[10px]">{workspaces.length}</span>
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto">
              {workspaces.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/workspaces/${ws.id}`}
                  onClick={() => {
                    setUserMenuOpen(false);
                    onItemClick?.();
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-colors",
                    ws.id === wsId
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{ws.name}</span>
                  </div>
                  {ws.id === wsId && <Check className="h-3.5 w-3.5 shrink-0 ml-1.5" />}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* User Profile Card Button */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (workspaces.length > 1) {
                setUserMenuOpen(!userMenuOpen);
              }
            }}
            className={cn(
              "flex items-center gap-2.5 overflow-hidden text-left p-1 rounded-xl transition-colors flex-1 mr-1",
              workspaces.length > 1 ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"
            )}
            title={workspaces.length > 1 ? "Switch Workspace" : "User Profile"}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground shrink-0">
              {user?.full_name?.charAt(0) || "U"}
            </div>
            <div className="flex flex-col truncate min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-foreground truncate">
                  {user?.full_name || "User"}
                </span>
                {workspaces.length > 1 && (
                  <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform shrink-0", userMenuOpen && "rotate-180")} />
                )}
              </div>
              <span className="text-[11px] text-muted-foreground truncate">
                {currentWorkspace?.name || user?.email || "Account"}
              </span>
            </div>
          </button>

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
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground font-medium">Appearance</span>
          <CompactThemeMenu />
        </div>
      </div>
    </aside>
  );
}
