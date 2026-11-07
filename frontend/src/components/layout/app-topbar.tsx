"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { ModKey } from "@/components/ui/mod-key";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";

interface AppTopbarProps {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}

function getPageLabel(pathname: string, dict: ReturnType<typeof useI18n>["dict"]) {
  if (pathname.startsWith("/assistants/")) return dict.common.assistant;
  if (pathname.startsWith("/assistants")) return dict.common.assistants;
  if (pathname.startsWith("/sources")) return dict.common.knowledge;
  if (pathname.startsWith("/playground")) return dict.common.playground;
  if (pathname.startsWith("/settings")) return dict.common.settings;
  return dict.common.overview;
}

export function AppTopbar({ onOpenMenu, onOpenSearch }: AppTopbarProps) {
  const pathname = usePathname();
  const { dict } = useI18n();

  const pageLabel = getPageLabel(pathname, dict);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-[#090A0C]/90 px-4 backdrop-blur-md sm:h-16 sm:px-6 select-none">
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile drawer toggle */}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex h-9 w-9 items-center justify-center border border-zinc-800 bg-[#101217] text-zinc-400 hover:text-white hover:border-zinc-700 active:bg-zinc-800 md:hidden"
          aria-label={dict.common.openNavigation}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Brand mark visible in mobile topbar */}
        <Link href="/overview" className="flex items-center gap-2 md:hidden">
          <WeirwiseMark className="h-6 w-auto" />
        </Link>

        {/* Current Page Title */}
        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-mono uppercase tracking-wider text-zinc-500 md:inline">
            {"//"}
          </span>
          <span className="truncate text-sm sm:text-base font-bold uppercase tracking-wider text-white font-mono">
            {pageLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Minimalist Quick Search trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden h-9 items-center gap-2 border border-zinc-800 bg-[#101217] px-3 text-[11px] font-mono text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors sm:flex"
        >
          <Search className="h-3.5 w-3.5 text-[#CCFF00]" />
          <span className="uppercase tracking-wider">{dict.common.quickSearch}</span>
          <kbd className="ms-2 border border-zinc-800 bg-black/60 px-1 py-0.5 text-[9px] text-zinc-400">
            <ModKey />
          </kbd>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-9 items-center justify-center border border-zinc-800 bg-[#101217] text-zinc-400 hover:text-white sm:hidden"
          aria-label={dict.common.search}
        >
          <Search className="h-4 w-4 text-[#CCFF00]" />
        </button>
      </div>
    </header>
  );
}
