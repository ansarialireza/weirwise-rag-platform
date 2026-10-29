"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Bot,
  Database,
  Layers,
  Settings,
  LogOut,
  ChevronRight,
  FolderGit2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Workspace, Project } from "@/types";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

interface SidebarProps {
  currentWorkspace: Workspace | null;
  currentProject: Project | null;
  workspaces: Workspace[];
  projects: Project[];
}

export function Sidebar({
  currentWorkspace,
  currentProject,
  workspaces,
  projects,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const wsId = currentWorkspace?.id;
  const pId = currentProject?.id;

  const navItems = [
    {
      label: "Assistants Studio",
      href: wsId && pId ? `/workspaces/${wsId}/projects/${pId}` : "#",
      icon: Bot,
      active: wsId && pId && (pathname.includes(`/projects/${pId}`) && !pathname.includes("/sources")),
      disabled: !wsId || !pId,
    },
    {
      label: "Knowledge Sources",
      href: wsId && pId ? `/workspaces/${wsId}/projects/${pId}/sources` : "#",
      icon: Database,
      active: pathname.includes("/sources"),
      disabled: !wsId || !pId,
    },
    {
      label: "Workspace Settings",
      href: wsId ? `/workspaces/${wsId}/settings` : "#",
      icon: Settings,
      active: pathname.includes("/settings"),
      disabled: !wsId,
    },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card transition-colors">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-sm shadow-sm">
            W
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-foreground">
              Weirwise
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              Platform Studio
            </span>
          </div>
        </div>
      </div>

      {/* Scope Pickers: Workspace & Project */}
      <div className="p-4 space-y-3 border-b border-border bg-card/50">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Active Workspace
          </label>
          <div className="mt-1 flex items-center justify-between rounded-lg border border-border bg-input px-3 py-2 text-xs font-medium text-foreground shadow-sm">
            <span className="truncate">{currentWorkspace?.name || "Select Workspace"}</span>
            <Layers className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          </div>
        </div>

        {currentWorkspace && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Active Project
            </label>
            <div className="mt-1 flex items-center justify-between rounded-lg border border-border bg-input px-3 py-2 text-xs font-medium text-foreground shadow-sm">
              <span className="truncate">{currentProject?.name || "Select Project"}</span>
              <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground/50 cursor-not-allowed"
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
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                item.active
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Theme Switcher & User Profile Footer */}
      <div className="border-t border-border p-3.5 space-y-3 bg-card/60">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-medium text-muted-foreground">Theme</span>
          <ThemeSwitcher />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary border border-border text-xs font-bold text-foreground">
              {user?.full_name?.charAt(0) || "U"}
            </div>
            <div className="flex flex-col truncate">
              <span className="text-xs font-medium text-foreground truncate">
                {user?.full_name || "User"}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {user?.email || ""}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus:outline-none focus:ring-1 focus:ring-destructive"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
