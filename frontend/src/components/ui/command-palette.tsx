"use client";

import React, { useEffect, useState, useRef } from "react";
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

  // Swipe-to-dismiss touch tracking for mobile bottom drawer
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [drawerTranslateY, setDrawerTranslateY] = useState(0);

  const router = useRouter();
  const { theme, setTheme } = useTheme();

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

  // Lock body scroll when open & reset drag
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setDrawerTranslateY(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
      setQuery("");
      setDrawerTranslateY(0);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const items: CommandItem[] = [
    // Navigation
    {
      id: "nav-overview",
      title: "Go to Overview",
      subtitle: "Operational metrics & progression",
      icon: LayoutDashboard,
      category: "Navigation" as const,
      onSelect: () => router.push(`/overview`),
    },
    {
      id: "nav-knowledge",
      title: "Go to Knowledge Sources",
      subtitle: "Manage vectorized document datasets",
      icon: Database,
      category: "Navigation" as const,
      onSelect: () => router.push(`/sources`),
    },
    {
      id: "nav-assistants",
      title: "Go to Assistants",
      subtitle: "View and configure grounded AI models",
      icon: Bot,
      category: "Navigation" as const,
      onSelect: () => router.push(`/assistants`),
    },
    {
      id: "nav-playground",
      title: "Open Interactive Playground",
      subtitle: "Test queries with real-time citations",
      icon: Sliders,
      category: "Navigation" as const,
      onSelect: () => router.push(`/playground`),
    },
    // Actions
    {
      id: "act-new-assistant",
      title: "Create New Assistant",
      subtitle: "Define system prompt and attach knowledge",
      icon: Plus,
      category: "Actions" as const,
      onSelect: () => router.push(`/assistants`),
    },
    {
      id: "act-upload-knowledge",
      title: "Upload Knowledge Document",
      subtitle: "Ingest PDF, Markdown, or text documents",
      icon: Database,
      category: "Actions" as const,
      onSelect: () => router.push(`/sources`),
    },
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
      subtitle: "High-contrast Onyx dark appearance",
      icon: Moon,
      category: "Preferences" as const,
      onSelect: () => setTheme("dark"),
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

  // Swipe-down touch handlers for mobile drawer
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const deltaY = e.touches[0].clientY - touchStartY;
    if (deltaY > 0) {
      setDrawerTranslateY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (drawerTranslateY > 90) {
      setOpen(false);
    } else {
      setDrawerTranslateY(0);
    }
    setTouchStartY(null);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-start md:pt-20 bg-background/80 backdrop-blur-md animate-in fade-in duration-100"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command search palette"
    >
      {/* 
        Responsive Pattern:
        - Mobile (< md): Bottom Drawer anchored to viewport bottom with swipe-down handle & slide-in-from-bottom
        - Desktop (>= md): Floating Centered Dialog Card anchored near top
      */}
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: drawerTranslateY > 0 ? `translateY(${drawerTranslateY}px)` : undefined,
          transition: touchStartY === null ? "transform 0.15s ease-out" : "none",
        }}
        className={cn(
          "w-full bg-popover text-popover-foreground border-border/60 shadow-2xl overflow-hidden flex flex-col text-xs relative",
          // Mobile: Native Bottom Drawer
          "mt-auto md:mt-0 rounded-t-3xl md:rounded-3xl border-t md:border border-x-0 md:border-x max-h-[85vh] md:max-h-[70vh] md:max-w-xl animate-in slide-in-from-bottom-6 md:slide-in-from-bottom-0 md:zoom-in-95 duration-150"
        )}
      >
        {/* Mobile Swipe-Down Handle */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden cursor-grab active:cursor-grabbing">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors" />
        </div>

        {/* Search Header Bar with Visible 'X' Button on all viewports */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card/60">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, surfaces, or toggle settings..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          {/* Close button with high-contrast affordance */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
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
            <span className="hidden md:inline">ESC or tap backdrop to close</span>
            <kbd className="hidden md:inline-block px-1.5 py-0.5 rounded border border-border bg-muted text-[10px]">ESC</kbd>
            <span className="md:hidden">Swipe down or tap X to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
