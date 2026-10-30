"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Search,
  Bot,
  Database,
  Sliders,
  Settings,
  Plus,
  LayoutDashboard,
  Moon,
  Sun,
  Laptop,
  Palette,
  ArrowRight,
  Command as CommandIcon,
} from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "Navigation" | "Actions" | "Preferences";
  onSelect: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const params = useParams();
  const { theme, setTheme } = useTheme();

  const workspaceId = params.workspaceId as string | undefined;
  const projectId = params.projectId as string | undefined;

  const baseProj = workspaceId && projectId ? `/workspaces/${workspaceId}/projects/${projectId}` : "";

  // Keyboard shortcut listener: Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const items: CommandItem[] = [
    // Navigation
    ...(baseProj
      ? [
          {
            id: "nav-overview",
            title: "Go to Overview",
            subtitle: "Project operational metrics & progression",
            icon: LayoutDashboard,
            category: "Navigation" as const,
            onSelect: () => router.push(`${baseProj}/overview`),
          },
          {
            id: "nav-knowledge",
            title: "Go to Knowledge Sources",
            subtitle: "Manage vectorized document datasets",
            icon: Database,
            category: "Navigation" as const,
            onSelect: () => router.push(`${baseProj}/sources`),
          },
          {
            id: "nav-assistants",
            title: "Go to Assistants",
            subtitle: "View and configure grounded AI models",
            icon: Bot,
            category: "Navigation" as const,
            onSelect: () => router.push(`${baseProj}/assistants`),
          },
          {
            id: "nav-playground",
            title: "Open Interactive Playground",
            subtitle: "Test queries with real-time citations",
            icon: Sliders,
            category: "Navigation" as const,
            onSelect: () => router.push(`${baseProj}/playground`),
          },
        ]
      : []),
    ...(workspaceId
      ? [
          {
            id: "nav-settings",
            title: "Go to Workspace Settings",
            subtitle: "Usage, subscription, API keys, and members",
            icon: Settings,
            category: "Navigation" as const,
            onSelect: () => router.push(`/workspaces/${workspaceId}/settings`),
          },
        ]
      : []),
    // Actions
    ...(baseProj
      ? [
          {
            id: "act-new-assistant",
            title: "Create New Assistant",
            subtitle: "Define system prompt and attach knowledge",
            icon: Plus,
            category: "Actions" as const,
            onSelect: () => router.push(`${baseProj}/assistants`),
          },
          {
            id: "act-upload-knowledge",
            title: "Upload Knowledge Document",
            subtitle: "Ingest PDF, Markdown, or text documents",
            icon: Database,
            category: "Actions" as const,
            onSelect: () => router.push(`${baseProj}/sources`),
          },
        ]
      : []),
    // Theme Preferences
    {
      id: "theme-system",
      title: "Theme: Automatic (System)",
      subtitle: "Follow operating system appearance automatically",
      icon: Laptop,
      category: "Preferences" as const,
      onSelect: () => setTheme("system"),
    },
    {
      id: "theme-dark",
      title: "Theme: Dark Mode",
      subtitle: "Onyx charcoal with electric lime accent",
      icon: Moon,
      category: "Preferences" as const,
      onSelect: () => setTheme("dark"),
    },
    {
      id: "theme-colorful",
      title: "Theme: Colorful Mode",
      subtitle: "Cosmic twilight with electric violet and cyan accents",
      icon: Palette,
      category: "Preferences" as const,
      onSelect: () => setTheme("colorful"),
    },
    {
      id: "theme-light",
      title: "Theme: Light Mode",
      subtitle: "High-contrast clean slate aesthetic",
      icon: Sun,
      category: "Preferences" as const,
      onSelect: () => setTheme("light"),
    },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col text-xs animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-label="Command search palette"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search commands, navigate surfaces, or toggle settings... (ESC to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-border bg-secondary text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results Stream */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No matching commands found.
            </div>
          ) : (
            filteredItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                    setQuery("");
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs text-foreground hover:bg-secondary/70 focus:bg-secondary/70 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-[11px] text-muted-foreground">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 border-t border-border/60 bg-card/60 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <span>Weirwise Command Search</span>
          <div className="flex items-center gap-2">
            <span>Press</span>
            <kbd className="px-1 py-0.5 rounded border border-border bg-secondary text-[10px]">Ctrl+K</kbd>
            <span>anywhere</span>
          </div>
        </div>
      </div>
    </div>
  );
}
