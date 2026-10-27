"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Bot,
  Database,
  Layers,
  Settings,
  Shield,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Workspace, Project } from "@/types";

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
      label: "Assistants",
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
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      {/* Brand & Workspace Selector */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
          W
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Weirwise
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            Platform
          </span>
        </div>
      </div>

      {/* Scope Pickers */}
      <div className="p-4 space-y-3 border-b border-border">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspace
          </label>
          <div className="mt-1 flex items-center justify-between rounded-md border border-border bg-input px-3 py-2 text-xs font-medium text-foreground">
            <span className="truncate">{currentWorkspace?.name || "Select Workspace"}</span>
            <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </div>
        </div>

        {currentWorkspace && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Project
            </label>
            <div className="mt-1 flex items-center justify-between rounded-md border border-border bg-input px-3 py-2 text-xs font-medium text-foreground">
              <span className="truncate">{currentProject?.name || "Select Project"}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </div>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                item.active
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                item.disabled && "pointer-events-none opacity-40"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="border-t border-border p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground">
            {user?.full_name?.charAt(0) || "U"}
          </div>
          <div className="flex flex-col truncate">
            <span className="text-xs font-medium text-foreground truncate">
              {user?.full_name}
            </span>
            <span className="text-[10px] text-muted-foreground truncate">
              {user?.email}
            </span>
          </div>
        </div>
        <button
          onClick={() => logout()}
          title="Sign out"
          className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
