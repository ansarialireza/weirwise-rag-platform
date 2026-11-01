"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
  X,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const params = useParams();
  const { theme, setTheme } = useTheme();

  const workspaceId = params.workspaceId as string | undefined;
  const projectId = params.projectId as string | undefined;

  const baseProj = workspaceId && projectId ? `/workspaces/${workspaceId}/projects/${projectId}` : "";

  // Keyboard shortcut listener: Cmd+K or Ctrl+K & Escape
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

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
      setQuery("");
    }
    return () => {
      document.body.style.overflow = "";
    };
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-4 sm:pt-20 bg-background/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command search palette"
    >
      {/* Dialog Container */}
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-xl rounded-3xl border border-border/60 bg-popover text-popover-foreground shadow-2xl overflow-hidden flex flex-col text-xs animate-in zoom-in-95 duration-150 relative",
          // Mobile responsive sizing: sit gracefully at top or slide nicely
          "max-h-[85vh] sm:max-h-[70vh]"
        )}
      >
        {/* Search Input Bar with Mobile-Friendly 'X' Close Button */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40 bg-card/60">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, navigate surfaces, or toggle settings..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          {/* Explicit, easy-to-tap close button */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results Stream */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1">
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
                  className="w-full flex items-center justify-between p-3 sm:p-2.5 rounded-2xl text-left text-xs text-foreground hover:bg-muted/70 active:bg-muted focus:bg-muted transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 ml-2" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2.5 border-t border-border/40 bg-card/40 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <span>Weirwise Quick Search</span>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">ESC or tap backdrop to close</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-border bg-muted text-[10px]">ESC</kbd>
            <span className="sm:hidden">Tap X to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
