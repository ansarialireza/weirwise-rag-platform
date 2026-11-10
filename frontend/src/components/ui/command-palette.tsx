"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search,
  Bot,
  Database,
  MessageSquare,
  Plus,
  LayoutDashboard,
  Moon,
  Sun,
  Laptop,
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
  category: "Go to" | "Create" | "Appearance";
  onSelect: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    document.body.style.overflow = "";
    setQuery("");
  }, [open]);

  const go = (path: string) => {
    router.push(path);
    setOpen(false);
  };

  const items: CommandItem[] = [
    { id: "overview", title: "Overview", subtitle: "Your dashboard at a glance", icon: LayoutDashboard, category: "Go to", onSelect: () => go("/overview") },
    { id: "knowledge", title: "Knowledge", subtitle: "Files and websites your assistants can use", icon: Database, category: "Go to", onSelect: () => go("/sources") },
    { id: "assistants", title: "Assistants", subtitle: "Create and manage assistants", icon: Bot, category: "Go to", onSelect: () => go("/assistants") },
    { id: "playground", title: "Test assistant", subtitle: "Ask a real question and check the answer", icon: MessageSquare, category: "Go to", onSelect: () => go("/playground") },
    { id: "new-assistant", title: "Create an assistant", subtitle: "Start with a name and your knowledge", icon: Plus, category: "Create", onSelect: () => go("/assistants") },
    { id: "add-knowledge", title: "Add knowledge", subtitle: "Upload files or crawl a website", icon: Plus, category: "Create", onSelect: () => go("/sources") },
    { id: "theme-light", title: "Light appearance", subtitle: "Calm canvas", icon: Sun, category: "Appearance", onSelect: () => setTheme("light") },
    { id: "theme-dark", title: "Dark appearance", subtitle: "Onyx", icon: Moon, category: "Appearance", onSelect: () => setTheme("dark") },
    { id: "theme-system", title: "Match system", subtitle: "Use your device setting", icon: Laptop, category: "Appearance", onSelect: () => setTheme("system") },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
  );

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-onyx/50 p-0 backdrop-blur-[2px] animate-in-opacity sm:items-start sm:p-6 sm:pt-24"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Quick search"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-popover text-popover-foreground shadow-lift animate-in sm:rounded-xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages and actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
            aria-label="Close quick search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] flex-1 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No results for “{query}”.
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
                  className="group flex w-full items-center justify-between gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted touch-manipulation"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground group-hover:text-accent">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-foreground">{item.title}</div>
                      {item.subtitle && (
                        <div className="truncate text-[11px] text-muted-foreground">{item.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-accent" />
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))] sm:pb-2 text-[11px] text-muted-foreground">
          <span>Weirwise quick search</span>
          <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px]">ESC</kbd>
        </div>
      </div>
    </div>,
    document.body
  );
}
